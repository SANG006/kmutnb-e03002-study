const duration = 40 * 60 * 1000;
const storageKey = "kmutnb-e03002-day01.v1";
const modes = ["practice", "timed", "review"];

function emptyState() {
  return {version: 1, read: [], last: null, attempt: null};
}

function newAttempt(mode, now = Date.now(), minutes = 40) {
  if (!modes.includes(mode)) throw new Error("Unknown quiz mode");
  return {mode, started: now, deadline: mode === "timed" ? now + minutes * 60_000 : null,
    finished: null, index: 0, answers: {}, marked: []};
}

function settle(attempt, now = Date.now(), manual = false) {
  if (!attempt || attempt.finished !== null) return false;
  if (attempt.deadline !== null && now >= attempt.deadline) {
    attempt.finished = attempt.deadline;
    return true;
  }
  if (!manual) return false;
  attempt.finished = Math.max(attempt.started, now);
  return true;
}

function scores(questions, answers) {
  const result = {total: 0, wrong: 0, blank: 0, math: 0, science: 0};
  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer) result.blank++;
    else if (answer === question.correct) {
      result.total++;
      result[question.subject] = (result[question.subject] ?? 0) + 1;
    } else result.wrong++;
  }
  return result;
}

function sanitize(raw, lessons, questions, minutes = 40) {
  const invalid = () => { throw new Error("Invalid progress file"); };
  const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const time = value => Number.isSafeInteger(value) && value > 0;
  const validLesson = id => lessons.some(lesson => lesson.id === id);
  const byId = new Map(questions.map(question => [question.id, question]));
  if (!plain(raw) || raw.version !== 1 || !Array.isArray(raw.read)
      || !raw.read.every(validLesson) || (raw.last !== null && !validLesson(raw.last))) invalid();
  const state = {version: 1, read: [...new Set(raw.read)], last: raw.last, attempt: null};
  if (time(raw.lastOpened)) state.lastOpened = raw.lastOpened;
  if (raw.attempt === null) return state;
  const a = raw.attempt;
  if (!plain(a) || !modes.includes(a.mode) || !time(a.started)
      || a.deadline !== (a.mode === "timed" ? a.started + minutes * 60_000 : null)
      || (a.finished !== null && (!time(a.finished) || a.finished < a.started
        || (a.deadline !== null && a.finished > a.deadline)))
      || !Number.isInteger(a.index) || a.index < 0 || a.index >= questions.length
      || !plain(a.answers) || !Array.isArray(a.marked) || !a.marked.every(id => byId.has(id))) invalid();
  for (const [id, option] of Object.entries(a.answers)) {
    if (!byId.get(id)?.options.some(item => item.id === option)) invalid();
  }
  state.attempt = {mode: a.mode, started: a.started, deadline: a.deadline, finished: a.finished,
    index: a.index, answers: {...a.answers}, marked: [...new Set(a.marked)]};
  return state;
}

export {duration, storageKey, emptyState, newAttempt, settle, scores, sanitize};
