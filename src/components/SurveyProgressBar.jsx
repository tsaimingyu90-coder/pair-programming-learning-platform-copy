export default function SurveyProgressBar({ currentStep, totalSteps = 3 }) {
  // currentStep: 1 = quiz, 2 = anxiety, 3 = efficacy, 4 = collaboration (post only)
  const allSteps = [
    { label: "第一部分", sub: "程式知識測驗" },
    { label: "第二部分", sub: "程式焦慮量表" },
    { label: "第三部分", sub: "自我效能感量表" },
    { label: "第四部分", sub: "協作學習知覺量表" },
  ];
  const steps = allSteps.slice(0, totalSteps);

  return (
    <div className="flex items-center mb-4 px-1">
      {steps.map((step, i) => {
        const stepNum = i + 1;
        const isDone = stepNum < currentStep;
        const isActive = stepNum === currentStep;
        return (
          <>
            <div key={i} className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition ${
                isDone ? "bg-green-500 border-green-500 text-white" :
                isActive ? "bg-blue-600 border-blue-600 text-white" :
                "bg-white border-gray-300 text-gray-400"
              }`}>
                {isDone ? "✓" : stepNum}
              </div>
              <p className={`text-xs font-semibold mt-1 whitespace-nowrap ${isActive ? "text-blue-700" : isDone ? "text-green-600" : "text-gray-400"}`}>
                {step.label}
              </p>
              <p className="text-xs text-gray-400 hidden sm:block whitespace-nowrap">{step.sub}</p>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mb-5 ${isDone ? "bg-green-400" : "bg-gray-200"}`} />
            )}
          </>
        );
      })}
    </div>
  );
}