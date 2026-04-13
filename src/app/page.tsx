'use client';
import { useScheduleStore } from '@/store/useScheduleStore';
import StepOne from '@/components/StepOne';
import StepTwo from '@/components/StepTwo';
import StepThree from '@/components/StepThree';

const STEPS = [
  { label: '基本設定' },
  { label: '排班偏好' },
  { label: '查看結果' },
];

export default function Home() {
  const step = useScheduleStore(s => s.step);

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-5xl mx-auto">
        {/* 標題 */}
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">呼吸治療師排班系統</h1>

        {/* 步驟指示器 */}
        <div className="flex items-center justify-center mb-8">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const isActive = num === step;
            const isDone = num < step;
            return (
              <div key={i} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-blue-600 text-white'
                        : isDone
                        ? 'bg-blue-200 text-blue-700'
                        : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isDone ? '✓' : num}
                  </div>
                  <span className={`text-xs mt-1 ${isActive ? 'text-blue-600 font-medium' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-16 h-0.5 mx-1 mb-4 ${isDone ? 'bg-blue-300' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* 步驟內容 */}
        {step === 1 && <StepOne />}
        {step === 2 && <StepTwo />}
        {step === 3 && <StepThree />}
      </div>
    </main>
  );
}
