import {storageKey as pilotKey, emptyState, newAttempt, settle, scores, sanitize} from "./model.mjs";

const main = document.querySelector("#main");
const dialog = document.querySelector("#confirm-dialog");
const storageNote = document.querySelector("#storage-note");
const labels = ["ก", "ข", "ค", "ง"];
const subjects = {math: "คณิตศาสตร์", science: "วิทยาศาสตร์", trade: "วิชาชีพ", english: "ภาษาอังกฤษ"};
const modes = {practice: "ฝึกทำ", timed: "จับเวลา", review: "ฝึกทบทวน"};
const downloads = "./downloads/";
const scoped = new Set(["overview","lessons","lesson","quiz","attempt","results","record","references"]);
const datasets = new Map();
const inMemory = new Map();
const dayRoute = (id, path = "overview") => "day/" + id + "/" + path;
const stateKey = id => id === "01" ? pilotKey : "kmutnb-e03002-day" + id + ".v1";
const hashFor = path => scoped.has(path.split("/")[0]) ? dayRoute(day.id, path) : path;
let curriculum, day, navigation = 0, ready = false;
let planSearch = "", planSubject = "";
const h = value => String(value).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const button = (label, route, secondary = false) => `<a class="button${secondary ? " secondary" : ""}" href="#${hashFor(route)}">${label}</a>`;
const action = (label, name, value = "", secondary = false, disabled = false) =>
  `<button type="button" class="button${secondary ? " secondary" : ""}" data-action="${name}" data-value="${value}"${disabled ? " disabled" : ""}>${label}</button>`;
const heading = (title, lead = "") => `<header class="page-head"><p class="kicker">${day ? "DAY " + day.id + " / 18" : "แผนเตรียมสอบ E03002"}</p><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ""}</header>`;
const guideLink = (label, page) => `<a href="${downloads}${day.pdf}#page=${page}">${label}</a>`;
let lessons, graphs, sources, questions, state;
let status = "";
let subjectFilter = "";
let lessonSearch = "";
let reviewOpen = false;
let pendingConfirmation;

async function loadJson(name) {
  const response = await fetch(new URL(`../../data/${name}.json`, import.meta.url));
  if (!response.ok) throw new Error(`Cannot load ${name}`);
  return response.json();
}

function save() {
  inMemory.set(day.id, state);
  try {
    localStorage.setItem(stateKey(day.id), JSON.stringify(state));
  } catch {
    storageNote.hidden = false;
  }
}

function readState() {
  let value;
  try {
    value = localStorage.getItem(stateKey(day.id));
  } catch {
    storageNote.hidden = false;
    return inMemory.get(day.id) ?? emptyState();
  }
  try {
    return value === null ? emptyState() : sanitize(JSON.parse(value), lessons, questions, day.minutes);
  } catch {
    status = "ข้อมูลเดิมอ่านไม่ได้ เริ่มใช้ความคืบหน้าชุดใหม่ได้จากหน้านี้";
    return emptyState();
  }
}

function plot(key) {
  const g = graphs[key];
  const minX = g.x[0], maxX = g.x.at(-1), minY = g.y[0], maxY = g.y.at(-1);
  const x = value => 56 + 450 * (value - minX) / (maxX - minX);
  const y = value => 166 - 135 * (value - minY) / (maxY - minY);
  const points = g.points.map(([t, v]) => `${x(t)},${y(v)}`).join(" ");
  const baseline = y(0);
  const coordinateText = g.points.map(([t,v]) => `(${t}, ${v})`).join(", ");
  return `<svg class="graph" viewBox="0 0 530 212" role="img" aria-label="${h(g.label)} เทียบกับเวลา t (s) เส้นเชื่อมพิกัด ${h(coordinateText)}">
    <text x="56" y="20">${h(g.label)}</text>
    ${g.x.map(t => `<line class="gridline" x1="${x(t)}" y1="31" x2="${x(t)}" y2="166"/><text x="${x(t)}" y="185" text-anchor="middle">${t}</text>`).join("")}
    ${g.y.map(v => `<line class="gridline" x1="56" y1="${y(v)}" x2="506" y2="${y(v)}"/><text x="47" y="${y(v)+5}" text-anchor="end">${v}</text>`).join("")}
    ${g.shade ? `<polygon points="${x(g.points[0][0])},${baseline} ${points} ${x(g.points.at(-1)[0])},${baseline}"/>` : ""}
    <path class="axis" d="M56 31 V166 H506 M56 ${baseline} H506" fill="none"/>
    <polyline class="trace" points="${points}"/>
    ${g.points.map(([t,v]) => `<circle cx="${x(t)}" cy="${y(v)}" r="3.4"/>`).join("")}
    <text x="506" y="205" text-anchor="end">เวลา t (s)</text>
  </svg>`;
}

function readSnapshot(id) {
  if (id === day?.id && state) return state;
  if (!storageNote.hidden && inMemory.has(id)) return inMemory.get(id);
  try {
    const value = JSON.parse(localStorage.getItem(stateKey(id)));
    return value?.version === 1 && Array.isArray(value.read) ? value : emptyState();
  } catch {
    return emptyState();
  }
}

function home() {
  const latest = curriculum.map(item => ({...item, saved: readSnapshot(item.id)}))
    .filter(item => item.saved.last).sort((a,b) => (b.saved.lastOpened ?? 0) - (a.saved.lastOpened ?? 0))[0];
  return `<section class="hero">
    <div><p class="kicker">10–27 พฤศจิกายน 2569</p>
    <h1>เตรียมสอบเข้า<span>เตรียมวิศวะ มจพ.</span></h1>
    <p class="lead">เตรียมวิศวกรรมไฟฟ้าและอิเล็กทรอนิกส์ โปรแกรมภาษาไทย E รหัส 03002 · โควตาเรียนดี ปีการศึกษา 2570</p>
    <div class="actions">${button("เปิดแผน 18 วัน", "plan")}${button("สรุปก่อนสอบ", dayRoute("18"), true)}${latest ? button("อ่านบทล่าสุด", dayRoute(latest.id, "lesson/" + latest.saved.last), true) : ""}</div></div>
    <div class="hero-plot"><h2>เลือกชุดฝึก</h2><ul class="list"><li><a href="#day/01/overview">DAY 01 · พื้นฐานและการเคลื่อนที่</a></li><li><a href="#day/15/quiz">DAY 15 · สอบจำลองชุดที่ 1</a></li><li><a href="#day/17/quiz">DAY 17 · สอบจำลองชุดที่ 2</a></li></ul></div>
  </section>
  <div class="metrics"><span>18 วัน</span><span>${curriculum.reduce((sum,item) => sum + item.lessons,0)} บทเรียน</span><span>445 ข้อพร้อมเฉลย</span><span>2 ชุดสอบจำลอง · ชุดละ 120 นาที</span></div>
  <section class="section panel"><h2>กำหนดการสอบโควตาเรียนดี ปีการศึกษา 2570</h2>
  <p>28 พฤศจิกายน 2569 · ข้อเขียน 09.00–11.00 น. · สัมภาษณ์ 13.00–16.00 น.</p>
  <p class="source">ตรวจระเบียบการวันที่ 12 พฤศจิกายน 2569 · <a href="https://www.admission.kmutnb.ac.th/sites/default/files/2026-08/Quota-Cert2570_0.pdf">ประกาศ มจพ. หน้า 3–4</a></p></section>`;
}

function dayCards() {
  const term = planSearch.trim().toLowerCase();
  const matches = curriculum.filter(item => (!planSubject || item.subjects[planSubject] || item.lessonSubjects?.includes(planSubject)) &&
    [item.title, "day " + item.id, ...item.topics].some(text => text.toLowerCase().includes(term)));
  return matches.length ? matches.map(item => {
    const saved = readSnapshot(item.id);
    return `<article class="card"><p class="kicker">DAY ${item.id} · ${item.date} พ.ย. 2569</p>
    <h2><a href="#${dayRoute(item.id)}">${h(item.title)}</a></h2>
    <p>${item.lessons} บท · ${item.count ? item.count + " ข้อ · " + item.minutes + " นาที" : "ทบทวนและซ้อมสัมภาษณ์"}</p>
    <p class="tag">อ่านแล้ว ${saved.read.length}/${item.lessons} บท</p></article>`;
  }).join("") : "<p>ไม่พบวันที่ตรงกับคำค้น</p>";
}

function plan() {
  return `${heading("แผนเตรียมสอบ 18 วัน", "ค้นหัวข้อหรือเลือกวิชา แล้วเปิดบทเรียนตามวันที่ในแผน")}
    <div class="filters"><label>ค้นหัวข้อ<input id="plan-search" type="search" value="${h(planSearch)}" placeholder="เช่น ไฟฟ้า"></label>
    <label>วิชา<select id="plan-subject"><option value="">ทุกวิชา</option>${Object.entries(subjects).map(([id,name]) => `<option value="${id}"${id===planSubject ? " selected" : ""}>${name}</option>`).join("")}</select></label></div>
    <div class="grid" id="day-cards" aria-live="polite">${dayCards()}</div>`;
}

function overview() {
  const checklist = data.checklist ?? [];
  const schedule = data.schedule ?? ["20.00–20.50 อ่านคณิตศาสตร์", "20.50–21.00 พัก", "21.00–21.50 อ่านฟิสิกส์",
    "21.50–22.00 พัก", "22.00–22.40 ทำแบบทดสอบ", "22.40–23.00 ตรวจเฉลย"];
  return `<section class="hero${day.id === "01" ? "" : " hero-single"}"><div><p class="kicker">DAY ${day.id} / 18 · ${day.date} พฤศจิกายน 2569</p>
    <h1>${h(day.title)}</h1><p class="lead">${lessons.length} บทเรียน${questions.length ? " · " + questions.length + " ข้อ · " + day.minutes + " นาที" : " · ทบทวนเบาและเตรียมสัมภาษณ์"}</p>
    <div class="actions">${button("เปิดบทเรียน", "lessons")}${questions.length ? button("ไปทำแบบทดสอบ", "quiz", true) : ""}${button("ความคืบหน้าวันนี้", "record", true)}</div></div>
    ${day.id==="01" ? `<figure class="hero-plot">${plot("lesson-v")}<figcaption>กราฟความเร็ว–เวลาจากบทที่ 9</figcaption></figure>` : ""}</section>
    ${checklist.length ? `<section class="section panel"><h2>รายการเตรียมวันสอบ</h2><ul class="list">${checklist.map(text => `<li>${h(text)}</li>`).join("")}</ul>${data.oralReview ? `<h3>ทบทวนปากเปล่า</h3><p>${h(data.oralReview)}</p>` : ""}</section>` : ""}
    <section class="section"><h2>บทเรียนวันนี้</h2><div class="grid">${lessonCards()}</div></section>
    ${schedule.length ? `<section class="section panel"><h2>ตารางอ่าน</h2><dl class="schedule">${schedule.map(line => {
      const [time,...activity] = line.split(" ");
      return `<dt>${h(time)}</dt><dd>${h(activity.join(" "))}</dd>`;
    }).join("")}</dl><p>${guideLink("เปิดตารางและแผนย่อในหนังสือ",4)}</p></section>` : ""}
    <div class="actions">${button("กลับแผน 18 วัน","plan",true)}${button("เอกสารและแหล่งอ้างอิง","references",true)}</div>`;
}

function lessonCards() {
  const term = lessonSearch.trim().toLowerCase();
  const matches = lessons.filter(lesson => (!subjectFilter || lesson.subject === subjectFilter)
    && [lesson.title, lesson.goal, ...lesson.rules].some(value => value.toLowerCase().includes(term)));
  if (!matches.length) return "<p>ไม่พบบทเรียนที่ตรงกับคำค้น</p>";
  return matches.map(lesson => `<article class="card"><p class="kicker">บทที่ ${lesson.id} · ${subjects[lesson.subject]}</p>
  <h2><a href="#${dayRoute(day.id, "lesson/" + lesson.id)}">${h(lesson.title)}</a></h2><p>${h(lesson.goal)}</p>
  <p class="tag">${state.read.includes(lesson.id) ? "✓ อ่านแล้ว" : "ยังไม่ทำเครื่องหมายว่าอ่านแล้ว"}</p></article>`).join("");
}

function listLessons() {
  return `${heading("บทเรียน DAY " + day.id, "เลือกวิชาหรือค้นหัวข้อเพื่อทบทวนสูตรและตัวอย่างจากหนังสือ")}
    <div class="filters"><label>ค้นบทเรียน<input id="lesson-search" type="search" value="${h(lessonSearch)}" placeholder="เช่น ร้อยละ"></label>
    <label>วิชา<select id="subject-filter"><option value="">ทุกวิชา</option>${Object.entries(subjects).map(([key, name]) => `<option value="${key}"${key === subjectFilter ? " selected" : ""}>${name}</option>`).join("")}</select></label></div>
    <div class="grid" id="lesson-cards" aria-live="polite">${lessonCards()}</div>`;
}

function refs(ids) {
  return ids.map(id => sources[id] ? `<a href="${h(sources[id].url)}" title="${h(sources[id].title)}">${h(id)}</a>` : h(id)).join(" · ");
}

function figureMarkup(figure) {
  return `<figure class="lesson-figure"><img src="./${h(figure.url)}" alt="${h(figure.alt)}" loading="lazy"></figure>`;
}

function lessonPage(lesson) {
  const done = state.read.includes(lesson.id);
  return `${heading(h(lesson.title), h(lesson.goal))}
    <article class="panel"><h2>หลักการและสูตร</h2><ul class="list formula">${lesson.rules.map(rule => `<li>${h(rule)}</li>`).join("")}</ul>
    ${lesson.figure ? figureMarkup(lesson.figure) : ""}
    ${lesson.graphs ? `<div class="graphs">${lesson.graphs.map((key, i) => `<figure>${plot(key)}<figcaption>รูป 9.${i+1} · ${h(graphs[key].label)} เทียบกับเวลา</figcaption></figure>`).join("")}</div>` : ""}
    </article>
    <article class="panel"><h2>ตัวอย่างจากบทเรียน</h2>${lesson.examples ? lesson.examples.map(example => `<p>${h(example)}</p>`).join("") : `<p><strong>${h(lesson.example)}</strong></p><p>${h(lesson.work)}</p>`}
    <p class="notice"><strong>จุดที่ควรตรวจ</strong> ${h(lesson.caution)}</p>
    <p class="source">${guideLink(`หนังสือ หน้า ${lesson.pages.join("–")}`, lesson.pages[0])} · อ้างอิง ${refs(lesson.refs)}</p></article>
    <div class="section actions">${action(done ? "✓ อ่านแล้ว · ยกเลิกเครื่องหมาย" : "ทำเครื่องหมายว่าอ่านแล้ว", "read", lesson.id, done)}${button("กลับสารบัญ", "lessons", true)}${lesson.id < lessons.length ? button("บทถัดไป", `lesson/${lesson.id+1}`, true) : questions.length ? button("ทำแบบทดสอบ", "quiz", true) : button("กลับสรุปก่อนสอบ", "overview", true)}</div>`;
}

function quizMenu() {
  const a = state.attempt;
  if (!questions.length) return `${heading("ทบทวน DAY " + day.id)}${button("เปิดสรุปและรายการเตรียมสอบ", "overview")}`;
  const distribution = Object.entries(day.subjects).map(([id,count]) => subjects[id] + " " + count + " ข้อ").join(" · ");
  return `${heading("แบบทดสอบ DAY " + day.id, questions.length + " ข้อ · " + distribution + " · ข้อละ 1 คะแนน")}
    ${a ? `<section class="panel"><h2>${a.finished === null ? "รอบที่กำลังทำ" : "ผลรอบล่าสุด"}</h2><p>${modes[a.mode]} · ตอบแล้ว ${Object.keys(a.answers).length}/${questions.length} ข้อ</p><div class="actions">${button(a.finished === null ? "ทำต่อ" : "ดูผลและเฉลย", a.finished === null ? "attempt" : "results")}</div></section>` : ""}
    <section class="section grid">
      <article class="card"><h2>ฝึกทำ</h2><p>ทำตามจังหวะของตัวเอง แล้วอ่านเฉลยเมื่อส่งคำตอบ</p><div class="actions">${action("เริ่มฝึกทำ", "start", "practice")}</div></article>
      <article class="card"><h2>จับเวลา ${day.minutes} นาที</h2><p>เริ่มนับเมื่อกดเริ่ม เวลายังคงเดินขณะปิดหน้า และส่งคำตอบเมื่อครบเวลา</p><div class="actions">${action("เริ่มจับเวลา", "start", "timed")}</div></article>
      <article class="card"><h2>ฝึกทบทวน</h2><p>เปิดเฉลยทีละข้อระหว่างฝึกได้</p><div class="actions">${action("เริ่มฝึกทบทวน", "start", "review", true)}</div></article>
    </section>`;
}

function optionLabel(q, id) {
  const i = q.options.findIndex(item => item.id === id);
  return i < 0 ? "เว้นคำตอบ" : `${labels[i]}. ${h(q.options[i].text)}`;
}

function solution(q, answer) {
  const lesson = lessons.find(item => item.id === q.chapter);
  return `<div class="solution"><p><strong>คำตอบของคุณ</strong> ${optionLabel(q, answer)}</p>
  <p><strong>คำตอบที่ถูก</strong> ${optionLabel(q, q.correct)}</p>
  ${q.solution.principle ? `<p><strong>หลักการ</strong> ${h(q.solution.principle)}</p>` : ""}<p><strong>วิธีคิด</strong> ${h(q.solution.method)}</p>
  <p><strong>ตรวจอีกวิธี</strong> ${h(q.solution.check)}</p>
  ${q.solution.caution ? `<p><strong>จุดพลาด</strong> ${h(q.solution.caution)}</p>` : ""}
  ${q.solution.review ? `<p><strong>หัวข้อทบทวน</strong> ${h(q.solution.review)}</p>` : ""}
  <p><a href="#${dayRoute(q.reviewDay ?? day.id, "lesson/" + (q.reviewChapter ?? q.chapter))}">ทบทวนบทที่ ${q.reviewChapter ?? q.chapter} · ${h(q.reviewTitle ?? lesson.title)}</a></p>
  <p class="source">${guideLink(`โจทย์ หน้า ${q.source.study}`, q.source.study)} · <a href="${downloads}${day.answerPdf ?? day.pdf}#page=${q.source.answer}">เฉลยฉบับเต็ม หน้า ${q.source.answer}</a> · ${refs(q.refs)}</p></div>`;
}

function attemptPage() {
  const a = state.attempt;
  const q = questions[a.index];
  const marked = a.marked.includes(q.id);
  return `${heading("ทำแบบทดสอบ", `${modes[a.mode]} · ชุดฝึก DAY ${day.id}`)}
    <div class="quiz-layout"><section class="panel">
    <div class="quiz-top"><p class="kicker">ข้อ ${q.number} / ${questions.length} · ${subjects[q.subject]}</p>
    ${a.deadline ? `<output id="timer" class="timer" aria-label="เวลาที่เหลือ" aria-live="off">${day.minutes}:00</output>` : ""}</div>
    <fieldset><legend id="question-heading" tabindex="-1">${h(q.prompt)}</legend>
    ${q.graph ? `<figure>${plot(q.graph)}</figure>` : q.figure ? figureMarkup(q.figure) : ""}
    <div class="options">${q.options.map((item, i) => `<label class="option"><input type="radio" name="answer" value="${item.id}"${a.answers[q.id] === item.id ? " checked" : ""}><b>${labels[i]}.</b><span>${h(item.text)}</span></label>`).join("")}</div></fieldset>
    <div class="actions">${action("ข้อก่อนหน้า", "jump", a.index-1, true, a.index === 0)}
      ${action("ข้อถัดไป", "jump", a.index+1, true, a.index === questions.length-1)}
      <button type="button" class="button secondary" data-action="mark" aria-pressed="${marked}">${marked ? "★ ปักข้อแล้ว" : "☆ ปักข้อนี้"}</button>
      ${action("ล้างคำตอบข้อนี้", "clear-answer", "", true, !a.answers[q.id])}</div>
    ${a.mode === "review" ? `<details id="review-solution" class="section"${reviewOpen ? " open" : ""}><summary>เปิดเฉลยข้อนี้</summary>${solution(q, a.answers[q.id])}</details>` : ""}
    </section><aside class="panel"><h2>แผงคำตอบ</h2><p id="answered-count" aria-live="polite">ตอบแล้ว ${Object.keys(a.answers).length}/${questions.length} ข้อ</p>
    <div class="jump" aria-label="ไปที่ข้อ">${questions.map((item,i) => {
      const answered = !!a.answers[item.id], flagged = a.marked.includes(item.id);
      return `<button type="button" data-action="jump" data-value="${i}" class="${answered ? "done" : ""}"${i===a.index ? ' aria-current="step"' : ""} aria-label="ข้อ ${i+1}, ${answered ? "ตอบแล้ว" : "ยังไม่ตอบ"}${flagged ? ", ปักไว้" : ""}">${i+1}${flagged ? '<span class="marked">★</span>' : ""}</button>`;
    }).join("")}</div>
    <div class="section actions">${action("ส่งคำตอบ", "submit")}${button("ออกแล้วกลับมาทำต่อ", "quiz", true)}</div>
    </aside></div>`;
}

function results() {
  const a = state.attempt;
  const score = scores(questions, a.answers);
  const blocks = [["คะแนนรวม", `${score.total}/${questions.length}`],
    ...Object.entries(day.subjects).map(([id,count]) => [subjects[id], `${score[id] ?? 0}/${count}`]),
    ["ข้อผิด", score.wrong], ["ข้อเว้น", score.blank]];
  return `${heading("ผลการทำและเฉลย", `${modes[a.mode]}${a.deadline === a.finished ? " · ส่งเมื่อหมดเวลา" : ""}`)}
    <section class="panel"><h2>คะแนนรอบนี้</h2><div class="result-stats">${blocks.map(([label, value]) => `<div><strong>${value}</strong>${label}</div>`).join("")}</div>
    <div class="actions">${button("กลับไปเลือกโหมด", "quiz", true)}</div></section>
    <section class="section"><h2 class="section-title">เฉลยรายข้อ</h2>${questions.map(q => {
      const answer = a.answers[q.id];
      const mark = !answer ? "เว้น" : answer === q.correct ? "ถูก" : "ผิด";
      return `<details class="panel"><summary>ข้อ ${q.number} · ${h(q.topic)} <span class="tag${mark==="ผิด" ? " wrong" : ""}">${mark}</span></summary>
      <p class="section">${h(q.prompt)}</p>${q.graph ? `<figure>${plot(q.graph)}</figure>` : q.figure ? figureMarkup(q.figure) : ""}${solution(q,answer)}</details>`;
    }).join("")}</section>`;
}

function record() {
  const a = state.attempt;
  const score = a?.finished != null ? scores(questions, a.answers) : null;
  return `${heading("ความคืบหน้า", "ข้อมูลเก็บในเบราว์เซอร์นี้ และส่งออกไปเปิดบนเครื่องอื่นได้")}
    ${status ? `<p class="notice" role="status">${h(status)}</p>` : ""}
    <section class="panel"><h2>อ่านแล้ว ${state.read.length}/${lessons.length} บท</h2>${state.read.length ? `<ul class="list">${lessons.filter(l => state.read.includes(l.id)).map(l => `<li><a href="#${dayRoute(day.id, "lesson/" + l.id)}">${h(l.title)}</a></li>`).join("")}</ul>` : "<p>ทำเครื่องหมายว่าอ่านแล้วจากท้ายบทเรียน</p>"}</section>
    ${questions.length ? `<section class="panel"><h2>แบบทดสอบล่าสุด</h2><p>${score ? `ได้ ${score.total}/${questions.length} คะแนน` : a ? `กำลังทำ · ตอบแล้ว ${Object.keys(a.answers).length}/${questions.length} ข้อ` : "ยังไม่มีรอบการทำแบบทดสอบ"}</p>${a ? `<div class="actions">${button(score ? "ดูผลล่าสุด" : "ทำต่อ", score ? "results" : "attempt", true)}</div>` : ""}</section>` : ""}
    <section class="panel"><h2>จัดการข้อมูล</h2><div class="actions">${action("ส่งออก JSON", "export")}${action("นำเข้า JSON", "import", "", true)}${action("ล้างความคืบหน้า", "reset", "", true)}</div><input id="import-file" type="file" accept=".json,application/json" hidden></section>`;
}

function progress() {
  return `${heading("ความคืบหน้า", "ผลการฝึกและบทที่อ่านเก็บอยู่ในเบราว์เซอร์นี้")}
  <div class="grid">${curriculum.map(item => {
    const saved = readSnapshot(item.id);
    const a = saved.attempt;
    const detail = a ? a.finished === null ? "กำลังทำ · ตอบแล้ว " + Object.keys(a.answers ?? {}).length + "/" + item.count
      : "มีผลรอบล่าสุด" : "";
    return `<article class="card"><p class="kicker">DAY ${item.id}</p><h2><a href="#${dayRoute(item.id,"record")}">${h(item.title)}</a></h2>
    <p>อ่านแล้ว ${saved.read.length}/${item.lessons} บท${detail ? " · " + detail : ""}</p></article>`;
  }).join("")}</div>`;
}

function references() {
  return `${heading("เอกสารและแหล่งอ้างอิง DAY " + day.id)}
    <div class="actions"><a class="button" href="${downloads}${day.pdf}" download>ดาวน์โหลด PDF บทเรียน${day.answerPdf ? "" : "และเฉลย"}</a>
    ${day.answerPdf ? `<a class="button secondary" href="${downloads}${day.answerPdf}" download>ดาวน์โหลด PDF เฉลย</a>` : ""}</div>
    <section class="section panel"><h2>บรรณานุกรม</h2><ol class="list">${Object.entries(sources).map(([id, source]) =>
      `<li><a href="${h(source.url)}">${h(id)} · ${h(source.title)}</a>${source.publisher ? ` <span class="muted">· ${h(source.publisher)}</span>` : ""}</li>`).join("")}</ol></section>`;
}

function resources() {
  return `${heading("เอกสารดาวน์โหลด", "เลือก PDF ตามวัน หรือเปิดบรรณานุกรมของวันนั้น")}
    <div class="grid">${curriculum.map(item => `<article class="card"><p class="kicker">DAY ${item.id}</p><h2>${h(item.title)}</h2>
    <p><a href="${downloads}${item.pdf}" download>ดาวน์โหลด PDF</a>
    ${item.answerPdf ? ` · <a href="${downloads}${item.answerPdf}" download>PDF เฉลย</a>` : ""}
    · <a href="#${dayRoute(item.id,"references")}">บรรณานุกรม</a></p></article>`).join("")}</div>`;
}

function selection() {
  const raw = location.hash.slice(1) || "home";
  const parts = raw.split("/");
  if (parts[0] === "day") return {id: parts[1], path: parts.slice(2).join("/") || "overview"};
  return {id: scoped.has(parts[0]) ? "01" : null, path: raw};
}

function route() {
  return selection().path;
}

let data;
async function loadDay(id) {
  if (!datasets.has(id)) {
    const request = id === "01" ? Promise.all([loadJson("day01-lessons"), loadJson("day01-questions"), loadJson("sources")])
      .then(([study,quiz,bibliography]) => ({...study, questions:quiz, sources:bibliography})) : loadJson("days/" + id);
    datasets.set(id, request);
    request.catch(() => datasets.delete(id));
  }
  return datasets.get(id);
}

async function navigate(moveFocus = false) {
  const sequence = ++navigation;
  const {id} = selection();
  if (day?.id !== id) {
    const next = curriculum.find(item => item.id === id);
    if (next) {
      try {
        ready = false;
        main.setAttribute("aria-busy", "true");
        const loaded = await loadDay(id);
        if (sequence !== navigation) return;
        day = next;
        data = loaded;
        ({lessons, questions, sources, graphs = {}} = data);
        status = "";
        lessonSearch = subjectFilter = "";
        reviewOpen = false;
        state = readState();
      } catch (error) {
        if (sequence === navigation) showLoadError(error);
        return;
      }
    } else {
      day = null;
      state = emptyState();
    }
  }
  ready = true;
  render(moveFocus);
}

function showLoadError(error) {
  main.removeAttribute("aria-busy");
  main.innerHTML = '<p class="notice" role="alert">เปิดข้อมูลไม่ได้ กรุณารีเฟรชหรือกลับไปที่ <a href="#plan">แผน 18 วัน</a></p>';
  console.error(error);
}

function focusContent(id) {
  (document.getElementById(id) ?? main).focus({preventScroll: true});
}

function render(moveFocus = false) {
  const current = route();
  const [page, param] = current.split("/");
  const a = state.attempt;
  if (day && settle(a)) save();
  let html;
  let nav = day ? "plan" : page;
  switch (day || !selection().id ? page : "invalid") {
    case "home": html = home(); break;
    case "plan": html = plan(); break;
    case "overview": subjectFilter = lessonSearch = ""; html = overview(); break;
    case "lessons":
      subjectFilter = Object.hasOwn(subjects, param) ? param : "";
      html = listLessons(); break;
    case "lesson": {
      const lesson = lessons.find(item => String(item.id) === param);
      nav = "plan";
      if (!lesson) break;
      if (state.last !== lesson.id || state.lastOpened == null) {
        state.last = lesson.id;
        state.lastOpened = Date.now();
        save();
      }
      html = lessonPage(lesson);
      break;
    }
    case "quiz": html = quizMenu(); break;
    case "attempt":
      nav = "plan";
      if (!a || a.finished !== null) {
        location.replace("#" + hashFor(a ? "results" : "quiz"));
        return;
      }
      html = attemptPage();
      break;
    case "results":
      nav = "plan";
      if (!a || a.finished === null) {
        location.replace("#" + hashFor(a ? "attempt" : "quiz"));
        return;
      }
      html = results();
      break;
    case "progress": html = progress(); break;
    case "record": nav = "progress"; html = record(); break;
    case "references": nav = "resources"; html = references(); break;
    case "resources": html = resources(); break;
    case "main": focusContent("main"); return;
  }
  main.innerHTML = html ?? `${heading("ไม่พบหน้านี้")} ${button("กลับหน้าแรก", "home")}`;
  main.removeAttribute("aria-busy");
  for (const link of document.querySelectorAll("nav a")) {
    if (link.getAttribute("href") === `#${nav}`) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  tick();
  if (moveFocus) {
    window.scrollTo(0, 0);
    focusContent(page === "attempt" ? "question-heading" : "main");
  }
}

function tick() {
  if (!ready || !day || selection().id !== day.id) return;
  const a = state.attempt;
  if (settle(a)) {
    save();
    if (route() === "attempt") {
      location.hash = hashFor("results");
      return;
    }
    if (["quiz", "record"].includes(route())) render();
  }
  const timer = document.querySelector("#timer");
  if (!timer || !a?.deadline) return;
  const seconds = Math.max(0, Math.ceil((a.deadline-Date.now())/1000));
  const clock = [Math.floor(seconds/60), seconds%60].map(n => String(n).padStart(2,"0")).join(":");
  if (timer.textContent !== clock) timer.textContent = clock;
  timer.classList.toggle("urgent", seconds < 300);
}

function confirmAction(message, callback) {
  pendingConfirmation = callback;
  document.querySelector("#confirm-text").textContent = message;
  dialog.returnValue = "";
  dialog.showModal();
}

function submit() {
  if (!settle(state.attempt, Date.now(), true)) return;
  save();
  location.hash = hashFor("results");
}

function start(mode) {
  state.attempt = newAttempt(mode, Date.now(), day.minutes);
  reviewOpen = false;
  save();
  location.hash = hashFor("attempt");
}

function exportProgress() {
  const file = new Blob([JSON.stringify({...state, day: day.id}, null, 2)], {type: "application/json"});
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "KMUTNB_E03002_DAY" + day.id + "_Progress.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProgress(file) {
  if (!file) return;
  const targetDay = day.id;
  try {
    if (file.size > 64 * 1024) throw new Error("Too large");
    const raw = JSON.parse(await file.text());
    if (day?.id !== targetDay) return;
    if ((raw.day ?? "01") !== day.id) throw new Error("Wrong day");
    const imported = sanitize(raw, lessons, questions, day.minutes);
    confirmAction("ใช้ความคืบหน้าจากไฟล์นี้แทนข้อมูลปัจจุบันหรือไม่?", () => {
      if (day?.id !== targetDay) return;
      state = imported;
      settle(state.attempt);
      save();
      status = "นำเข้าความคืบหน้าแล้ว";
      render(true);
    });
  } catch {
    if (day?.id !== targetDay) return;
    status = "นำเข้าไม่ได้ กรุณาเลือกไฟล์ JSON ความคืบหน้า DAY " + day.id + " ที่ส่งออกจากเว็บนี้";
    render(true);
  }
}

function updateAnswer(q, selected, preserveFocus) {
  if (!ready || !day || selection().id !== day.id) return;
  const a = state.attempt;
  if (settle(a)) {
    save();
    location.hash = hashFor("results");
    return;
  }
  if (a.finished !== null) return;
  if (selected) a.answers[q.id] = selected;
  else delete a.answers[q.id];
  reviewOpen = document.querySelector("#review-solution")?.open ?? false;
  save();
  render();
  if (preserveFocus && selected) main.querySelector(`input[value="${selected}"]`)?.focus({preventScroll:true});
}

function onAction(event) {
  if (!ready || !day || selection().id !== day.id) return;
  const clicked = event.target.closest("button[data-action]");
  if (!clicked) return;
  const {action: name, value} = clicked.dataset;
  const a = state.attempt;
  if (route() === "attempt" && settle(a)) {
    save();
    location.hash = hashFor("results");
    return;
  }
  switch (name) {
    case "read": {
      const id = Number(value);
      state.read = state.read.includes(id) ? state.read.filter(item => item !== id) : [...state.read, id];
      save(); render();
      main.querySelector('[data-action="read"]')?.focus({preventScroll:true});
      break;
    }
    case "start":
      if (!questions.length) return;
      if (a) confirmAction("การเริ่มรอบใหม่จะแทนที่คำตอบและผลรอบล่าสุด เริ่มรอบใหม่หรือไม่?", () => start(value));
      else start(value);
      break;
    case "jump":
      if (Number(value) >= 0 && Number(value) < questions.length) {
        a.index = Number(value);
        reviewOpen = false;
        save(); render(true);
      }
      break;
    case "mark": {
      const id = questions[a.index].id;
      a.marked = a.marked.includes(id) ? a.marked.filter(item => item !== id) : [...a.marked, id];
      reviewOpen = document.querySelector("#review-solution")?.open ?? false;
      save(); render();
      main.querySelector('[data-action="mark"]')?.focus({preventScroll:true});
      break;
    }
    case "clear-answer": updateAnswer(questions[a.index], null, false); focusContent("question-heading"); break;
    case "submit": {
      const blank = questions.length - Object.keys(a.answers).length;
      if (blank) confirmAction(`ยังเว้น ${blank} ข้อ ต้องการส่งคำตอบหรือไม่?`, submit);
      else submit();
      break;
    }
    case "export": exportProgress(); break;
    case "import": document.querySelector("#import-file").click(); break;
    case "reset":
      confirmAction("ล้างบทที่อ่านและผลแบบทดสอบที่บันทึกในเบราว์เซอร์นี้หรือไม่?", () => {
        state = emptyState();
        save();
        status = "ล้างความคืบหน้าแล้ว";
        render(true);
      });
      break;
  }
}

async function init() {
  try {
    curriculum = await loadJson("curriculum");
    main.addEventListener("click", onAction);
    main.addEventListener("input", event => {
      if (event.target.id === "plan-search") {
        planSearch = event.target.value;
        document.querySelector("#day-cards").innerHTML = dayCards();
        return;
      }
      if (event.target.id !== "lesson-search") return;
      lessonSearch = event.target.value;
      document.querySelector("#lesson-cards").innerHTML = lessonCards();
    });
    main.addEventListener("change", event => {
      if (event.target.id === "plan-subject") {
        planSubject = event.target.value;
        document.querySelector("#day-cards").innerHTML = dayCards();
      }
      if (!ready || !day) return;
      if (event.target.name === "answer") updateAnswer(questions[state.attempt.index], event.target.value, true);
      if (event.target.id === "subject-filter") {
        location.hash = hashFor(event.target.value ? `lessons/${event.target.value}` : "lessons");
      }
      if (event.target.id === "import-file") {
        const [file] = event.target.files;
        event.target.value = "";
        void importProgress(file);
      }
    });
    document.querySelector(".skip").addEventListener("click", event => {
      event.preventDefault();
      focusContent("main");
    });
    dialog.addEventListener("close", () => {
      const callback = pendingConfirmation;
      pendingConfirmation = null;
      if (dialog.returnValue === "ok") callback?.();
    });
    window.addEventListener("hashchange", () => void navigate(true));
    window.addEventListener("pageshow", tick);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("storage", event => {
      if (event.key !== null && !event.key.startsWith("kmutnb-e03002-day")) return;
      if (day && event.key !== null && event.key !== stateKey(day.id)) return;
      if (day) state = readState();
      if (ready) render();
    });
    setInterval(tick, 250);
    await navigate();
  } catch (error) {
    main.removeAttribute("aria-busy");
    main.innerHTML = '<p class="notice" role="alert">เปิดข้อมูลบทเรียนไม่ได้ กรุณาเปิดเว็บผ่าน HTTP ตามขั้นตอนใน README แล้วลองใหม่</p>';
    console.error(error);
  }
}

void init();
