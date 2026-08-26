// ตัวอย่างข้อมูล hardcode ไว้ทดสอบ — ของจริงจะถูกแทนที่ตอน generate
var LESSON_DATA = {
  title: "บทที่ 1 บทนำสู่ปัญญาประดิษฐ์",
  videoUrl: "https://example.com/sample-video.mp4",
  contentHtml: "<p>นี่คือเนื้อหาตัวอย่างสำหรับทดสอบ SCORM package</p>",
  questions: [
    {
      questionText: "AI ย่อมาจากอะไร",
      choices: [
        { text: "Artificial Intelligence", isCorrect: true },
        { text: "Automatic Internet", isCorrect: false },
        { text: "Analog Input", isCorrect: false },
      ],
    },
  ],
};

var quizScore = 0;

function renderLesson() {
  document.getElementById("lesson-title").textContent = LESSON_DATA.title;
  document.getElementById("lesson-video").src = LESSON_DATA.videoUrl;
  document.getElementById("lesson-content").innerHTML = LESSON_DATA.contentHtml;
  renderQuiz();
}

function renderQuiz() {
  var container = document.getElementById("quiz-container");
  container.innerHTML = "";

  LESSON_DATA.questions.forEach(function (q, qIndex) {
    var qDiv = document.createElement("div");
    qDiv.className = "quiz-question";

    var qTitle = document.createElement("p");
    qTitle.className = "quiz-question-text";
    qTitle.textContent = (qIndex + 1) + ". " + q.questionText;
    qDiv.appendChild(qTitle);

    q.choices.forEach(function (c, cIndex) {
      var label = document.createElement("label");
      label.className = "quiz-choice";

      var input = document.createElement("input");
      input.type = "radio";
      input.name = "question-" + qIndex;
      input.value = cIndex;
      input.dataset.correct = c.isCorrect;

      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c.text));
      qDiv.appendChild(label);
    });

    container.appendChild(qDiv);
  });
}

function submitQuiz() {
  var total = LESSON_DATA.questions.length;
  var correct = 0;

  LESSON_DATA.questions.forEach(function (q, qIndex) {
    var selected = document.querySelector('input[name="question-' + qIndex + '"]:checked');
    if (selected && selected.dataset.correct === "true") {
      correct++;
    }
  });

  quizScore = Math.round((correct / total) * 100);
  document.getElementById("quiz-result").textContent =
    "คุณได้คะแนน " + correct + "/" + total + " (" + quizScore + "%)";

  // ส่งผลกลับ LMS ผ่าน SCORM API
  ScormAPI.setValue("cmi.core.score.raw", String(quizScore));
  ScormAPI.setValue("cmi.core.lesson_status", quizScore >= 60 ? "passed" : "failed");
  ScormAPI.commit();
}

window.addEventListener("load", function () {
  ScormAPI.initialize();
  ScormAPI.setValue("cmi.core.lesson_status", "incomplete");
  renderLesson();

  document.getElementById("submit-quiz-btn").addEventListener("click", submitQuiz);
});

window.addEventListener("beforeunload", function () {
  ScormAPI.commit();
  ScormAPI.terminate();
});
