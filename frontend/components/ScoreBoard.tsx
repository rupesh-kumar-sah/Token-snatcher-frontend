'use client';

interface ScoreBoardProps {
  score: number;
  combo: number;
}

export default function ScoreBoard({ score, combo }: ScoreBoardProps) {
  const multiplier = combo > 0 ? 1 + combo * 0.5 : 1;

  return (
    <div className="flex items-center gap-6">
      <div className="text-right">
        <div className="text-sm text-[#94a3b8] font-mono">Score</div>
        <div className="text-2xl font-bold text-white font-mono">{score.toLocaleString()}</div>
      </div>
      {combo > 0 && (
        <div className="text-right">
          <div className="text-sm text-[#94a3b8] font-mono">Combo</div>
          <div className="text-xl font-bold text-[#f59e0b] font-mono">
            x{multiplier.toFixed(1)}
          </div>
        </div>
      )}
    </div>
  );
}
