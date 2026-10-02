const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");

// โหลดไฟล์ .ts ตรงๆ (import type ถูกลบทิ้งตอน transpile จึงไม่ต้องจัดการ alias "@/")
require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  module._compile(out, filename);
};

const { validateAnswer } = require("../src/lib/quiz/dispatcher.ts");
const { parseDragDropAnswerData } = require("../src/lib/quiz/validators/drag-drop.ts");
const { validateMultiSelectAuthoring, validateDragDropAuthoring } = require("../src/lib/quiz/validators/authoring.ts");
const { validateMultiSelectByIndexes } = require("../src/lib/quiz/validators/multi-select.ts");
const form = require("../src/lib/quiz/drag-drop-form.ts");
const st = require("../src/lib/quiz/drag-drop-state.ts");
const { usesChoiceTable, isSingleChoiceType } = require("../src/lib/quiz/config/interaction-groups.ts");

const choices = [
  { id: "a", choice_text: "A", is_correct: true, order_index: 0 },
  { id: "b", choice_text: "B", is_correct: true, order_index: 1 },
  { id: "c", choice_text: "C", is_correct: false, order_index: 2 },
  { id: "d", choice_text: "D", is_correct: false, order_index: 3 },
];
const ms = (ids, q) => validateAnswer({ id: "q", interaction_type: "multi_select", answer_data: null, choices, ...q }, { choice_ids: ids });

test("multi_select: ถูกเมื่อชุดที่เลือกตรงเฉลยเป๊ะ (ไม่สนลำดับ)", () => {
  assert.deepEqual(ms(["b", "a"]), { is_correct: true });
});
test("multi_select: เลือกไม่ครบ / เกิน = ผิดแบบไม่มี error", () => {
  assert.deepEqual(ms(["a"]), { is_correct: false });
  assert.deepEqual(ms(["a", "b", "c"]), { is_correct: false });
});
test("multi_select: input ผิดรูปแบบ = error", () => {
  for (const bad of [[], ["a", "a"], ["zzz"], [""], [1], null, undefined, "a"]) {
    const r = ms(bad);
    assert.equal(r.is_correct, false);
    assert.ok(r.error, `ควรมี error สำหรับ ${JSON.stringify(bad)}`);
  }
  assert.ok(validateAnswer({ id: "q", interaction_type: "multi_select", answer_data: null, choices }, undefined).error);
  assert.ok(ms(["a"], { choices: undefined }).error);
  assert.ok(ms(["a"], { choices: choices.map((c) => ({ ...c, is_correct: false })) }).error);
});

const dd = {
  template: "supabase.{{b1}}('courses').{{b2}}('id').{{b3}}('published', true)",
  blanks: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
  words: [
    { id: "w1", text: "eq" }, { id: "w2", text: "insert" }, { id: "w3", text: "from" },
    { id: "w4", text: "where" }, { id: "w5", text: "select" },
  ],
  correct_map: { b1: "w3", b2: "w5", b3: "w1" },
};
const d = (placements, ad = dd) => validateAnswer({ id: "q", interaction_type: "drag_drop", answer_data: ad }, { placements });

test("drag_drop: ถูก/ผิด", () => {
  assert.deepEqual(d({ b1: "w3", b2: "w5", b3: "w1" }), { is_correct: true });
  assert.deepEqual(d({ b1: "w5", b2: "w3", b3: "w1" }), { is_correct: false });
});
test("drag_drop: input ผิดรูปแบบ = error", () => {
  const cases = [
    {}, { b1: "w3" }, { b1: "w3", b2: "w5", b3: "" },
    { b1: "w3", b2: "w3", b3: "w1" },            // ใช้คำซ้ำ
    { b1: "w3", b2: "w5", b3: "nope" },          // คำไม่มีในคลัง
    { b1: "w3", b2: "w5", b3: "w1", b9: "w2" },  // ช่องแปลกปลอม
    { b1: "w3", b2: "w5", b3: 5 },
    { constructor: "w1", b1: "w3", b2: "w5", b3: "w1" },
    [], null, "x",
  ];
  for (const c of cases) {
    const r = d(c);
    assert.equal(r.is_correct, false);
    assert.ok(r.error, `ควรมี error สำหรับ ${JSON.stringify(c)}`);
  }
});
test("drag_drop: เฉลยใน DB พัง = error ไม่ throw", () => {
  for (const ad of [null, "x", {}, { ...dd, correct_map: {} }]) {
    assert.ok(d({ b1: "w3", b2: "w5", b3: "w1" }, ad).error);
  }
});

test("authoring drag_drop: ผ่านเมื่อถูกต้อง และรายงานทุกปัญหา", () => {
  assert.deepEqual(validateDragDropAuthoring(dd), []);
  const broken = {
    template: "a {{b1}} b {{b1}} {{zz}}",
    blanks: [{ id: "b1" }, { id: "b2" }, { id: "b2" }],
    words: [{ id: "w1", text: "Eq" }, { id: "w2", text: " eq " }, { id: "w3", text: "" }],
    correct_map: { b1: "w1", b9: "w1" },
  };
  const errs = validateDragDropAuthoring(broken);
  const joined = errs.join("\n");
  for (const needle of ["ซ้ำ", "{{zz}}", "{{b1}} ปรากฏในโจทย์มากกว่า 1", "ว่างอยู่", "b9", "หลายช่อง", "b2"]) {
    assert.ok(joined.includes(needle), `ต้องมี "${needle}" ใน:\n${joined}`);
  }
});
test("authoring drag_drop: คำน้อยกว่าช่อง + ไม่รายงานซ้ำ", () => {
  const errs = validateDragDropAuthoring({ ...dd, words: dd.words.slice(0, 2), correct_map: { b1: "w1", b2: "w2" } });
  assert.ok(errs.join().includes("ไม่น้อยกว่า"));
  const dup = validateDragDropAuthoring({ ...dd, blanks: [{ id: "b1" }, { id: "b1" }] });
  assert.equal(new Set(dup).size, dup.length, `error ซ้ำ: ${dup.join(" | ")}`);
});
test("authoring drag_drop: id สงวน + ชนิดข้อมูลผิด", () => {
  assert.ok(!parseDragDropAnswerData({ ...dd, blanks: [{ id: "__proto__" }] }).ok);
  assert.ok(!parseDragDropAnswerData(null).ok);
  assert.ok(!parseDragDropAnswerData({ template: 1, blanks: "x", words: {}, correct_map: [] }).ok);
});

test("authoring multi_select", () => {
  const ok = [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }];
  assert.deepEqual(validateMultiSelectAuthoring(ok), []);
  assert.ok(validateMultiSelectAuthoring([{ text: "A", isCorrect: true }]).length > 0);
  assert.ok(validateMultiSelectAuthoring([{ text: "A", isCorrect: false }, { text: "B", isCorrect: false }]).join().includes("ถูกอย่างน้อย"));
  assert.ok(validateMultiSelectAuthoring([{ text: "A", isCorrect: true }, { text: "B", isCorrect: true }]).join().includes("ผิดอย่างน้อย"));
  assert.ok(validateMultiSelectAuthoring([{ text: "A", isCorrect: true }, { text: " a ", isCorrect: false }]).join().includes("ซ้ำ"));
  assert.ok(validateMultiSelectAuthoring([{ text: " ", isCorrect: true }, { text: "B", isCorrect: false }]).join().includes("ว่าง"));
  assert.ok(validateMultiSelectAuthoring(null).length > 0);
});

test("interaction-groups", () => {
  assert.equal(usesChoiceTable("multi_select"), true);
  assert.equal(isSingleChoiceType("multi_select"), false);
  assert.equal(usesChoiceTable("drag_drop"), false);
  assert.equal(usesChoiceTable(null), false);
});

// ===== Final Exam: ตรวจ multi_select ด้วย index (ชุดตัวเลือกเรียงตามที่ส่งให้นักเรียน) =====
const sorted = [{ is_correct: false }, { is_correct: true }, { is_correct: false }, { is_correct: true }];

test("multi_select by index: ถูกเมื่อชุด index ตรงเฉลย (ไม่สนลำดับ)", () => {
  assert.deepEqual(validateMultiSelectByIndexes(sorted, [3, 1]), { is_correct: true });
  assert.deepEqual(validateMultiSelectByIndexes(sorted, [1, 3]), { is_correct: true });
});
test("multi_select by index: ไม่ครบ/เกิน = ผิดแบบไม่มี error", () => {
  assert.deepEqual(validateMultiSelectByIndexes(sorted, [1]), { is_correct: false });
  assert.deepEqual(validateMultiSelectByIndexes(sorted, [0, 1, 3]), { is_correct: false });
});
test("multi_select by index: input จาก request body ผิดรูปแบบ = error ไม่ throw", () => {
  for (const bad of [undefined, null, "1", {}, [], [-1], [1.5], ["1"], [null], [1, 1], [9], [NaN], [{}], [true]]) {
    const r = validateMultiSelectByIndexes(sorted, bad);
    assert.equal(r.is_correct, false);
    assert.ok(r.error, `ควรมี error สำหรับ ${JSON.stringify(bad)}`);
  }
  assert.ok(validateMultiSelectByIndexes([{ is_correct: false }, { is_correct: false }], [0]).error);
  assert.ok(validateMultiSelectByIndexes([{ is_correct: true }], [0]).error); // ตัวเลือกน้อยกว่า 2
});

// ===== drag_drop: แปลงข้อมูลฟอร์มครู =====
test("drag_drop form: สร้าง answer_data จาก ___ และผ่านตัวตรวจกลาง", () => {
  const r = form.buildDragDropAnswerData({
    template: "supabase.___('courses').___('id, title').___('published', true)",
    answers: ["from", "select", "eq"],
    distractors: ["insert", "  ", "where"],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.data.template, "supabase.{{b1}}('courses').{{b2}}('id, title').{{b3}}('published', true)");
  assert.equal(r.data.words.length, 5); // 3 ถูก + 2 หลอก (ช่องว่างล้วนถูกตัดทิ้ง)
  assert.deepEqual(r.data.correct_map, { b1: "w1", b2: "w2", b3: "w3" });
  // ใช้ตรวจจริงผ่าน dispatcher ได้
  assert.deepEqual(validateAnswer({ id: "q", interaction_type: "drag_drop", answer_data: r.data }, { placements: { b1: "w1", b2: "w2", b3: "w3" } }), { is_correct: true });
});
test("drag_drop form: error ภาษาไทยครบทุกกรณี", () => {
  const errs = (s) => (form.buildDragDropAnswerData(s).errors ?? []).join(" | ");
  assert.match(errs({ template: "", answers: [], distractors: [] }), /กรุณากรอกโจทย์/);
  assert.match(errs({ template: "ไม่มีช่อง", answers: [], distractors: [] }), /ช่องว่างอย่างน้อย 1/);
  assert.match(errs({ template: "a ___ b ___", answers: ["x"], distractors: [] }), /ช่องว่างที่ 2 ยังไม่ได้ใส่/);
  assert.match(errs({ template: "a {{b1}} ___", answers: ["x"], distractors: [] }), /ห้ามมี/);
  assert.match(errs({ template: "a ___ ___", answers: ["eq", "EQ"], distractors: [] }), /ซ้ำ/);
  assert.match(errs({ template: "a ___", answers: ["eq"], distractors: ["Eq"] }), /ซ้ำ/);
  assert.match(errs({ template: "___ ".repeat(11), answers: Array(11).fill(0).map((_, i) => "w" + i), distractors: [] }), /ไม่เกิน/);
});
test("drag_drop form: แปลงไป-กลับได้ และข้อมูลผิดรูปแบบ = null", () => {
  const state = { template: "x ___ y ___ z", answers: ["A", "B"], distractors: ["C"] };
  const built = form.buildDragDropAnswerData(state);
  assert.deepEqual(form.parseDragDropToForm(built.data), state);
  assert.equal(form.parseDragDropToForm(null), null);
  assert.equal(form.parseDragDropToForm({ template: "x" }), null);
  assert.equal(form.countBlanks("a ___ b ______ c __"), 2);
  assert.deepEqual(form.resizeAnswers(["a"], 3), ["a", "", ""]);
  assert.deepEqual(form.resizeAnswers(["a", "b", "c"], 1), ["a"]);
});
test("drag_drop form: splitTemplate", () => {
  assert.deepEqual(form.splitTemplate("a {{b1}} b {{zz}} c", ["b1"]), [
    { type: "text", text: "a " }, { type: "blank", id: "b1" }, { type: "text", text: " b {{zz}} c" },
  ]);
});

// ===== drag_drop: state การลาก-วาง =====
test("drag_drop state: วาง/ย้าย/สลับ/เอาออก", () => {
  const blanks = ["b1", "b2", "b3"];
  let p = {};
  p = st.moveWord(p, "w1", "b2");
  assert.deepEqual(p, { b2: "w1" });
  p = st.moveWord(p, "w1", "b3"); // ย้ายจากช่องหนึ่งไปอีกช่อง
  assert.deepEqual(p, { b3: "w1" });
  p = st.moveWord(p, "w2", "b3"); // วางทับคำจากคลัง -> คำเดิมกลับคลัง
  assert.deepEqual(p, { b3: "w2" });
  p = st.moveWord(p, "w3", "b1");
  p = st.moveWord(p, "w3", "b3"); // ลากจากช่องไปช่องที่มีคำ -> สลับ
  assert.deepEqual(p, { b3: "w3", b1: "w2" });
  assert.equal(st.moveWord(p, "w3", "b3"), p);
  assert.deepEqual(st.clearBlank(p, "b1"), { b3: "w3" });
  assert.equal(st.clearBlank(p, "b2"), p);
  assert.equal(st.firstEmptyBlank(blanks, p), "b2");
  assert.equal(st.isComplete(blanks, p), false);
  assert.equal(st.isComplete(blanks, { b1: "a", b2: "b", b3: "c" }), true);
  assert.equal(st.isComplete([], {}), false);
});
test("drag_drop state: แตะคำ", () => {
  const blanks = ["b1", "b2"];
  assert.deepEqual(st.tapWord(blanks, {}, "w1", null), { b1: "w1" });
  assert.deepEqual(st.tapWord(blanks, { b1: "w1" }, "w2", null), { b1: "w1", b2: "w2" });
  assert.deepEqual(st.tapWord(blanks, {}, "w1", "b2"), { b2: "w1" }); // ช่องที่เลือกไว้ก่อน
  assert.deepEqual(st.tapWord(blanks, { b2: "w9" }, "w1", "b2"), { b2: "w9", b1: "w1" }); // ช่องที่เลือกไม่ว่าง -> ช่องว่างแรก
  const full = { b1: "w1", b2: "w2" };
  assert.equal(st.tapWord(blanks, full, "w3", null), full); // เต็ม = ไม่ทำอะไร
  assert.equal(st.tapWord(blanks, full, "w1", null), full); // คำที่วางแล้ว
  assert.deepEqual(st.unusedWords([{ id: "w1" }, { id: "w2" }, { id: "w3" }], full), [{ id: "w3" }]);
  assert.deepEqual(st.sanitizePlacements(blanks, ["w1"], { b1: "w1", b2: "zz", b9: "w1" }), { b1: "w1" });
});

test("drag_drop form: describeDragDropAnswer", () => {
  const built = form.buildDragDropAnswerData({ template: "a ___ b ___", answers: ["X", "Y"], distractors: ["Z"] });
  assert.deepEqual(form.describeDragDropAnswer(built.data), {
    segments: [{ type: "text", text: "a " }, { type: "word", text: "X" }, { type: "text", text: " b " }, { type: "word", text: "Y" }],
    distractors: ["Z"],
  });
  assert.equal(form.describeDragDropAnswer({}), null);
});
