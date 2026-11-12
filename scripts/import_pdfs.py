"""Import the delivered day PDFs into the static site's data files."""
import json
import re
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path
from shutil import copyfile

from pypdf import PdfReader
from pypdf.generic import ContentStream
from pypdf._text_extraction._layout_mode._fixed_width_page import recurs_to_target_op
from pypdf._text_extraction._layout_mode._text_state_manager import TextStateManager

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
INPUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "KMUTNB_E03002_Day01-Day18"
SUBJECTS = dict(zip(("คณิตศาสตร์", "วิทยาศาสตร์", "วิชาชีพ", "ภาษาอังกฤษ"), ("math", "science", "trade", "english")))
LETTERS = "กขคง"
COUNTS = [20,20,20,20,20,30,20,20,20,20,25,30,40,40,40,20,40,0]
# Full-length review sets point back to the subject lesson for each question.
# Codes use two digits for the day followed by the chapter number.
REVIEW_LINKS = {
    6: "011 012 013 014 015 021 022 023 032 034 035 044 043 052 054 016 017 018 025 026 036 036 037 038 045 045 055 055 056 056",
    13: "012 013 015 021 022 024 031 032 033 034 035 042 044 042 052 054 053 071 072 073 017 018 016 025 084 037 036 038 045 045 046 055 056 074 075 082 082 083 082 075",
    15: "012 013 033 023 034 051 044 054 071 072 017 026 036 038 045 055 075 075 082 083 091 092 094 093 094 101 101 103 102 103 111 111 112 113 114 121 122 123 124 124",
    16: "021 034 071 051 031 019 025 025 056 081 094 092 102 101 103 112 111 122 121 123",
    17: "015 022 032 035 042 052 053 054 072 073 019 025 037 038 045 056 074 082 083 084 091 092 091 093 094 101 101 102 103 103 111 112 113 122 122 122 123 123 124 124",
}
SOURCE_IDS = r"\[([A-Z][A-Z0-9]*)\]"
SUP = str.maketrans("0123456789−+-=()mn", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺⁻⁼⁽⁾ᵐⁿ")
FIGURES = {
    (3, 15): ("linear", "กราฟค่าใช้จ่าย y (บาท) กับจำนวนสินค้า x (ชิ้น) จุด (0,1), (1,4), (2,7), (3,10), (4,13)", "0 1 2 3 4"),
    (5, 17): ("wave", "กราฟการกระจัด (cm) กับตำแหน่ง x (cm) แกนนอน 0–10 cm และแกนตั้ง −2 ถึง 2 cm เส้นผ่านจุด (0,−1), (2,2), (5,−2), (8,2), (10,−1)", "0 1 2 3 4 5 6 7 8 9 10"),
    (7, 17): ("lens", "แผนภาพแนวรังสีเลนส์นูน วัตถุอยู่ที่ 3f และเกิดภาพจริงกลับหัวที่ 1.5f อีกด้านของเลนส์", "วัตถุที่ 3f"),
    (8, 9): ("circuit", "วงจรแหล่งจ่าย 6 V คร่อมตัวต้านทาน 6 Ω และ 3 Ω ซึ่งต่อขนานกัน", "6 Ω 3 Ω6 V"),
    (9, 7): ("circuit", "วงจรแหล่งจ่าย 6 V คร่อมตัวต้านทาน 6 Ω และ 3 Ω ซึ่งต่อขนานกัน", "6 Ω 3 Ω6 V"),
}

QUIZ_FIGURES = {
    (3,33): FIGURES[(3,15)],
    (5,30): FIGURES[(5,17)],
    (5,31): FIGURES[(5,17)],
    (7,23): ("frequency", "แผนภูมิความถี่ คะแนน 2 มี 2 คน คะแนน 5 มี 3 คน คะแนน 6 มี 1 คน", "จำนวนคน"),
    (8,20): FIGURES[(8,9)],
    (17,16): ("velocity", "กราฟความเร็ว v (m/s) กับเวลา t (s) เส้นตรงจาก (0,2) ถึง (4,8)", "0 1 2 3 4"),
}


def normalize(text):
    text = text.replace("\u0000", "").replace("\u00a0", " ").replace("ํา", "ำ")
    for ligature, letters in zip("ﬀﬁﬂﬃﬄ", ("ff", "fi", "fl", "ffi", "ffl")):
        text = text.replace(ligature, letters)
    text = re.sub(r"ํ([่้๊๋])า", r"\1ำ", text).replace("T ense", "Tense")
    return re.sub(r" +(?=[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e])", "", text)


def recover_exponents(page, text):
    operations = ContentStream(page["/Contents"].get_object(), page.pdf, "bytes").operations
    # These PDFs put a page-level vertical flip before the drawing operations.
    # Skip it so text baselines increase downward, as in the printed page.
    if operations and operations[0][1] == b"cm" and operations[0][0][:4] == [1,0,0,-1]:
        operations = operations[1:]
    ops = iter(operations + [([], b"Q")])
    fonts = page._layout_mode_fonts()
    _, runs = recurs_to_target_op(ops, TextStateManager(), b"Q", fonts)
    runs = [r for r in runs if r.txt.strip()]
    raw = []
    replacements = {}
    for index, run in enumerate(runs):
        chunk = re.sub(r"\s", "", normalize(run.txt))
        nearby = runs[max(0,index-5):index] + runs[index+1:index+6]
        baseline = any(1.8 <= neighbor.ty-run.ty <= 6
                       and 1.12 < neighbor.font_height/run.font_height < 1.7
                       and abs(neighbor.tx-run.tx) < 42 for neighbor in nearby)
        if baseline and chunk and all(ord(c) in SUP for c in chunk):
            replacements.update((len(raw)+i, char) for i,char in enumerate(chunk.translate(SUP)))
        raw.extend(chunk)
    if not replacements:
        return text
    positions = [i for i,c in enumerate(text) if not c.isspace()]
    plain = [text[i] for i in positions]
    result = list(text)
    for a,b,size in SequenceMatcher(None,raw,plain,autojunk=False).get_matching_blocks():
        for i in range(size):
            if a+i in replacements:
                result[positions[b+i]] = replacements[a+i]
    return "".join(result)


def clean(text):
    return " ".join(text.split())


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def references(lines):
    bibliography = {}
    for i,line in enumerate(lines):
        match = re.match(r"^\[([A-Z][A-Z0-9]*)\] (.+)", line)
        if not match:
            continue
        ref, title = match.groups()
        tail = []
        for value in lines[i+1:]:
            if value.startswith("https://"):
                bibliography[ref] = {"title": clean(" ".join([title,*tail])), "url": value.split()[0]}
                break
            if re.match(SOURCE_IDS, value):
                break
            tail.append(value)
    return bibliography


def slice_field(text, start, end):
    return clean(text.split(start,1)[1].split(end,1)[0])


def import_day(day):
    key = f"{day:02}"
    filename = f"KMUTNB_E03002_Day{key}.pdf"
    original = INPUT / filename
    pdf = PdfReader(original)
    pages = [normalize(p.extract_text()) for p in pdf.pages]
    guide_count = next(i for i,t in enumerate(pages) if "ANSWER KEY" in t[:240])
    guide = pages[:guide_count]
    title = guide[0].splitlines()[0].split(" • ")[0]
    minute_match = re.search(r"เวลา (\d+) นาที", guide[0])
    minutes = int(minute_match[1]) if minute_match else 0
    assert minutes == (120 if day in (15,17) else 0 if day == 18 else 40), (day, minutes)
    bibliography = {}
    lessons, questions, answers, quick = [], {}, {}, {}
    subject = "math"
    for i,text in enumerate(guide):
        lines = text.splitlines()
        if len(lines) < 3:
            continue
        if lines[2] == "บทเรียน":
            subject = SUBJECTS[lines[3]]
        if lines[2].startswith("บรรณานุกรม"):
            bibliography.update(references(lines[3:]))
        lesson_header = re.fullmatch(r"บทที่ (\d+) • (?!อธิบายเพิ่มเติม)(.+)", lines[2])
        if lesson_header:
            number, name = lesson_header.groups()
            revised = recover_exponents(pdf.pages[i], text)
            extra = recover_exponents(pdf.pages[i+1], guide[i+1])
            body = revised.split("เป้าหมายการเรียนรู้\n",1)[1].splitlines()
            understanding = revised.split("ต้องเข้าใจ",1)[1].split("ข้อควรระวัง",1)[0]
            figure = FIGURES.get((day,i+1))
            if figure:
                understanding = understanding.split(figure[2],1)[0]
            examples = re.findall(r"ตัวอย่างการประยุกต์ \d+\n(.*?)(?=\nตัวอย่างการประยุกต์|\nตรวจความเข้าใจ|\nสิ่งที่ฉันเข้าใจ|$)",extra,re.S)
            lessons.append(dict(id=int(number), subject=subject, title=name, goal=body[0],
                                rules=[clean("\n".join(body[1:]).split("ต้องจำ",1)[0]),
                                       slice_field(revised,"ต้องจำ","ต้องเข้าใจ"), clean(understanding)],
                                examples=list(map(clean,examples)),
                                caution=slice_field(revised,"ข้อควรระวัง","หลักการอ้างอิง"),
                                pages=[i+1,i+2], refs=re.findall(SOURCE_IDS,revised.split("หลักการอ้างอิง",1)[1]),
                                **({"figure": {"url": f"figures/{figure[0]}.png", "alt": figure[1]}} if figure else {})))
        group = re.match(r"^(คณิตศาสตร์|วิทยาศาสตร์|วิชาชีพ|ภาษาอังกฤษ) • ข้อ \d+", lines[2])
        if not group:
            continue
        revised = recover_exponents(pdf.pages[i], text)
        matches = re.finditer(r"^(\d{2})\.\s+(.+?)\n(?:คำตอบและวิธีคิด|ค่าที่อ่านจากกราฟ[^\n]*)", revised, re.M | re.S)
        for match in matches:
            number = int(match[1])
            pieces = re.split(r"(?<![ก-๙])([กขคง])\.\s+",match[2])
            assert pieces[1::2] == list(LETTERS), (day,i+1,number,match[2])
            assert number not in questions
            illustration = QUIZ_FIGURES.get((day,i+1))
            prompt = pieces[0].split("\n" + illustration[2],1)[0] if illustration else pieces[0]
            questions[number] = dict(id=f"d{key}-q{number:02}", number=number, subject=SUBJECTS[group[1]],
                                     prompt=clean(prompt),
                                     options=[dict(id=c,text=clean(t)) for c,t in zip("abcd", pieces[2::2])],
                                     source={"study": i+1},
                                     **({"figure": {"url": f"figures/{illustration[0]}.png",
                                                     "alt": illustration[1]}} if illustration else {}))
    for i,text in enumerate(pages[guide_count:], guide_count):
        lines = text.splitlines()
        if len(lines) < 3:
            continue
        if lines[2].startswith("บรรณานุกรม"):
            bibliography.update(references(lines[3:]))
        if "คำตอบสำหรับตรวจคะแนน" in lines:
            quick.update((int(n),c) for n,c in re.findall(r"\b(\d{2}) • ([กขคง])\b",text))
        if not re.search(r"^ข้อ \d{2} • ตอบ",text,re.M):
            continue
        revised = recover_exponents(pdf.pages[i], text)
        for m in re.finditer(r"^ข้อ (\d{2}) • ตอบ ([กขคง])\.\s*(.*?)\n(.*?)(?=^ข้อ \d{2} • ตอบ|\Z)", revised, re.M|re.S):
            n, letter, option, body = m.groups()
            n = int(n)
            topic, level, _ = body.splitlines()[0].split(" • ",2)
            solution = re.split(r"(หลักการและวิธีคิด|ตรวจอีกวิธี|จุดพลาดที่พบบ่อย|กลับไปทบทวน)",body)
            fields = {label:clean(value) for label,value in zip(solution[1::2],solution[2::2])}
            answers[n] = dict(letter=letter, option=clean(option), topic=topic, level=level.removeprefix("ระดับ"),
                              solution=dict(method=fields["หลักการและวิธีคิด"], check=fields["ตรวจอีกวิธี"],
                                            caution=fields.get("จุดพลาดที่พบบ่อย",""), review=fields["กลับไปทบทวน"]),
                              page=i+1, refs=re.findall(SOURCE_IDS,body.splitlines()[0]))
    expected = set(range(1,COUNTS[day-1]+1))
    assert set(questions) == set(answers) == set(quick) == expected, (day,expected-set(questions),expected-set(answers),expected-set(quick))
    notes = []
    for n,q in questions.items():
        a = answers[n]
        assert quick[n] == a["letter"], (day,n,quick[n],a)
        correct = LETTERS.index(a["letter"])
        option = q["options"][correct]["text"]
        def comparable(t):
            t = re.sub(r"\^\(([−+\d]+)\)",r"\1",t)
            return re.sub(r"\s|[.!?]$","",t.translate(str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ᵐⁿ","0123456789−+mn")))
        if comparable(option) != comparable(a["option"]):
            notes.append([day,n,option,a["option"]])
        q.update(topic=a["topic"], level=a["level"], refs=a["refs"], correct="abcd"[correct], solution=a["solution"])
        q["source"]["answer"] = a["page"]
        linked = re.search(fr"DAY {key} บท (\d+)",a["solution"]["review"])
        if linked:
            q["chapter"] = int(linked[1])
        else:
            related = [l for l in lessons if l["subject"] == q["subject"]]
            q["chapter"] = max(related or lessons, key=lambda l: len(set(l["refs"]) & set(a["refs"])))["id"]
    if day in REVIEW_LINKS:
        targets = REVIEW_LINKS[day].split()
        assert len(targets) == len(questions)
        for n,target in enumerate(targets,1):
            target_day, chapter = target[:2], int(target[2:])
            name = "day01-lessons.json" if target_day == "01" else f"days/{target_day}.json"
            target_data = json.loads((DOCS/"data"/name).read_text(encoding="utf-8"))
            target_lesson = next(l for l in target_data["lessons"] if l["id"] == chapter)
            questions[n].update(reviewDay=target_day,reviewChapter=chapter,reviewTitle=target_lesson["title"])
    missing = sorted({ref for item in [*lessons,*questions.values()] for ref in item["refs"]} - bibliography.keys())
    if missing:
        print("missing reference definitions", day, missing)
    assert [l["id"] for l in lessons] == list(range(1,len(lessons)+1)), (day,lessons)
    copyfile(original, DOCS / "downloads" / filename)
    data = dict(lessons=lessons, questions=[questions[n] for n in sorted(questions)], sources=bibliography,
                schedule=[clean(line) for line in guide[3].splitlines() if re.match(r"^\d\d\.\d\d",line)])
    if day == 18:
        review = next(t for t in guide if "ทบทวนเบาและเตรียมวันสอบ" in t.splitlines()[2:3])
        data["checklist"] = [clean(s.removesuffix("□")) for s in review.splitlines()[4:] if s.endswith("□")]
        data["oralReview"] = slice_field(review,"ทบทวนปากเปล่า","สิ่งที่ต้องตรวจเพิ่มเติม")
    write_json(DOCS/"data"/"days"/f"{key}.json",data)
    curriculum = dict(id=key,title=title,date=day+9,minutes=minutes,lessons=len(lessons),count=len(questions),
                      subjects=dict(Counter(q["subject"] for q in questions.values())),
                      topics=[l["title"] for l in lessons], lessonSubjects=sorted({l["subject"] for l in lessons}), pdf=filename)
    print(key,len(lessons),len(questions),minutes,dict(curriculum["subjects"]),flush=True)
    return curriculum, notes


def main():
    day_one = json.loads((DOCS/"data"/"day01-lessons.json").read_text(encoding="utf-8"))
    curriculum = [dict(id="01",title="พื้นฐานคณิตศาสตร์และการเคลื่อนที่",date=10,minutes=40,lessons=9,count=20,
                       subjects={"math":10,"science":10}, topics=[l["title"] for l in day_one["lessons"]],
                       pdf="KMUTNB_E03002_DAY01_StudyGuide.pdf",answerPdf="KMUTNB_E03002_DAY01_AnswerKey.pdf")]
    notes = []
    for day in range(2,19):
        item,issues = import_day(day)
        curriculum.append(item)
        notes.extend(issues)
    write_json(DOCS/"data"/"curriculum.json",curriculum)
    print("Differences between answer text and keyed option:",json.dumps(notes,ensure_ascii=False))
    assert not notes


if __name__ == "__main__":
    main()





