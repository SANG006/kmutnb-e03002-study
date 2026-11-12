import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync, existsSync} from "node:fs";
import {newAttempt, sanitize, scores, settle} from "../docs/assets/js/model.mjs";

const file = name => new URL("../docs/" + name, import.meta.url);
const json = name => JSON.parse(readFileSync(file("data/" + name + ".json"), "utf8"));
const plan = json("curriculum");
const contents = new Map(plan.map(day => [day.id, day.id === "01"
  ? {...json("day01-lessons"), questions:json("day01-questions"), sources:json("sources")}
  : json("days/" + day.id)]));

test("18 days, 74 lessons, and 445 scored questions are accounted for", () => {
  assert.equal(plan.length,18);
  assert.equal(plan.reduce((sum,day)=>sum+day.lessons,0),74);
  assert.equal(plan.reduce((sum,day)=>sum+day.count,0),445);
  assert.deepEqual(plan.map(d=>d.count),[20,20,20,20,20,30,20,20,20,20,25,30,40,40,40,20,40,0]);
  assert.deepEqual(plan.filter(d=>d.minutes===120).map(d=>d.id),["15","17"]);
  const ids = new Set();
  for (const day of plan) {
    const {lessons, questions, sources} = contents.get(day.id);
    assert.equal(lessons.length,day.lessons);
    assert.equal(questions.length,day.count);
    assert.ok(existsSync(file("downloads/"+day.pdf)));
    if(day.answerPdf) assert.ok(existsSync(file("downloads/"+day.answerPdf)));
    for (const item of [...lessons,...questions]) {
      for (const ref of item.refs) assert.match(sources[ref].url,/^https:\/\//);
      if(item.figure) assert.ok(existsSync(file(item.figure.url)));
    }
    const counts = {};
    for (const [i,q] of questions.entries()) {
      assert.equal(q.number,i+1);
      assert.ok(!ids.has(q.id));
      ids.add(q.id);
      assert.deepEqual(q.options.map(o=>o.id),["a","b","c","d"]);
      assert.equal(new Set(q.options.map(o=>o.text)).size,4);
      assert.ok(q.prompt && q.options.every(o=>o.text) && q.options.some(o=>o.id===q.correct));
      assert.ok(q.solution.method && q.solution.check && q.source.study > 0 && q.source.answer > 0);
      assert.ok(lessons.some(l=>l.id===q.chapter));
      if(q.reviewDay) assert.ok(contents.get(q.reviewDay).lessons.some(l=>l.id===q.reviewChapter && l.title===q.reviewTitle));
      counts[q.subject]=(counts[q.subject]??0)+1;
    }
    assert.deepEqual(counts,day.subjects);
  }
  assert.equal(ids.size,445);
  assert.equal(contents.get("18").checklist.length,4);
});

test("Both mock exams score 10 per subject and expire once at 120 minutes", () => {
  for (const id of ["15","17"]) {
    const {lessons,questions}=contents.get(id);
    const now=1000;
    const attempt=newAttempt("timed",now,120);
    assert.equal(attempt.deadline,now+7_200_000);
    for(const q of questions) attempt.answers[q.id]=q.correct;
    assert.deepEqual(scores(questions,attempt.answers),{total:40,wrong:0,blank:0,math:10,science:10,trade:10,english:10});
    assert.equal(settle(attempt,attempt.deadline-1),false);
    assert.equal(settle(attempt,attempt.deadline+1),true);
    assert.equal(attempt.finished,attempt.deadline);
    assert.equal(settle(attempt,attempt.deadline+2,true),false);
    assert.equal(sanitize({version:1,read:[],last:null,attempt},lessons,questions,120).attempt.finished,attempt.deadline);
    assert.throws(()=>sanitize({version:1,read:[],last:null,attempt},lessons,questions,40));
  }
});

