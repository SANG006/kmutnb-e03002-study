import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {duration, emptyState, newAttempt, settle, scores, sanitize} from "../docs/assets/js/model.mjs";

const read = file => JSON.parse(readFileSync(new URL(`../docs/data/${file}.json`, import.meta.url), "utf8"));
const {lessons, graphs} = read("day01-lessons");
const questions = read("day01-questions");
const sources = read("sources");

test("Day 01 inventory and answer key match the approved PDFs", () => {
  assert.equal(lessons.length, 9);
  assert.equal(questions.length, 20);
  assert.equal(new Set(questions.map(q => q.id)).size, 20);
  assert.deepEqual(questions.map(q => q.correct), [..."cabdacbdabdcbacdbdca"]);
  assert.equal(questions.filter(q => q.subject === "math").length, 10);
  assert.equal(questions.filter(q => q.subject === "science").length, 10);
  assert.deepEqual(["พื้นฐาน", "ประยุกต์", "วิเคราะห์"].map(level => questions.filter(q => q.level === level).length), [6,10,4]);
  for (const [i, q] of questions.entries()) {
    assert.equal(q.number, i + 1);
    assert.equal(q.source.study, 31 + Math.floor(i/2));
    assert.equal(q.source.answer, i < 18 ? 3 + Math.floor(i/2) : i - 6);
    assert.deepEqual(q.options.map(item => item.id), ["a","b","c","d"]);
    assert.equal(new Set(q.options.map(item => item.text)).size, 4);
    assert.ok(q.prompt.trim() && q.options.every(item => item.text.trim()));
    assert.ok(Object.values(q.solution).every(value => value.trim()));
    assert.ok(lessons.some(lesson => lesson.id === q.chapter && lesson.subject === q.subject));
    assert.ok(q.refs.every(ref => Object.hasOwn(sources, ref)));
  }
  for (const lesson of lessons) {
    assert.ok(lesson.refs.every(ref => Object.hasOwn(sources, ref)));
  }
  assert.equal(Object.keys(sources).length, 25);
});

test("Graph coordinates match the seven Study Guide graphs", () => {
  const expected = {
    "lesson-x": [[0,0],[4,8],[6,8],[10,0]], "lesson-d": [[0,0],[4,8],[6,8],[10,16]],
    "lesson-v": [[0,0],[4,8],[6,8]], q17: [[0,2],[2,8],[4,8],[6,2]],
    q18: [[0,0],[3,6],[5,6],[8,18]], q19: [[0,4],[2,0],[4,-4],[6,0]],
    q20: [[2,10],[6,-2]]
  };
  for (const [key, points] of Object.entries(expected)) assert.deepEqual(graphs[key].points, points);
  assert.deepEqual(questions.filter(q => q.graph).map(q => q.graph), ["q17","q18","q19","q20"]);
});

test("Scoring distinguishes wrong and unanswered responses by subject and uses IDs", () => {
  const a = {"d01-q01": "c", "d01-q02": "d", "d01-q11": "d"};
  assert.deepEqual(scores(questions, a), {total: 2, wrong: 1, blank: 17, math: 1, science: 1});
  assert.equal(scores(questions.map(q => ({...q, options: q.options.toReversed()})), a).total, 2);
  const all = Object.fromEntries(questions.map(q => [q.id,q.correct]));
  assert.equal(scores(questions, all).total, 20);
});

test("Timed attempts settle exactly once at the recorded deadline", () => {
  const a = newAttempt("timed", 1000);
  assert.equal(a.deadline, 1000 + duration);
  assert.equal(settle(a, a.deadline - 1), false);
  assert.equal(settle(a, a.deadline + 5000), true);
  assert.equal(a.finished, a.deadline);
  assert.equal(settle(a, a.deadline + 6000, true), false);
  const manual = newAttempt("timed", 1000);
  assert.equal(settle(manual, 2000, true), true);
  assert.equal(manual.finished, 2000);
  const untimed = newAttempt("practice", 1000);
  assert.equal(settle(untimed, a.deadline), false);
});

test("Progress imports valid data and rejects invalid IDs, modes, times and types", () => {
  const a = newAttempt("timed", 1000);
  a.answers["d01-q02"] = "a";
  a.marked = ["d01-q02"];
  const raw = {version: 1, read: [1,2,2], last: 2, attempt: a};
  assert.deepEqual(sanitize(raw, lessons, questions).read, [1,2]);
  assert.deepEqual(sanitize(emptyState(), lessons, questions), emptyState());
  for (const changed of [{version: 2}, {read: [100]}, {last: "2"}, {attempt: {...a, mode: "demo"}},
    {attempt: {...a, deadline: 500}}, {attempt: {...a, answers: {"d01-q01": "x"}}},
    {attempt: {...a, answers: {"d01-q99": "a"}}}, {attempt: {...a, marked: "x"}},
    {attempt: {...a, finished: a.deadline + 1}}]) {
    assert.throws(() => sanitize({...raw, ...changed}, lessons, questions));
  }
});
