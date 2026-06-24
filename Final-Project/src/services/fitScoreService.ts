import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

type ScoreBreakdown = {
  overallScore: number;
  skillsScore: number;
  experienceScore: number;
  educationScore: number;
  matchedSkills: string[];
  missingSkills: string[];
};

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'you', 'your', 'that', 'this', 'from', 'have',
  'will', 'our', 'are', 'not', 'all', 'can', 'but', 'has', 'any', 'job', 'role',
  'work', 'team', 'using', 'use', 'into', 'about', 'their', 'them', 'who', 'how',
  'what', 'when', 'where', 'why', 'was', 'were', 'been', 'being', 'its', 'than',
  'experience', 'skills', 'strong', 'ability', 'across', 'multiple', 'build',
  'maintain', 'implement', 'develop', 'manage', 'systems', 'environment',
  'environments', 'stage', 'multi', 'container', 'similar', 'including',
  'proficiency', 'knowledge', 'solid', 'advanced', 'hands', 'particularly',
  'similar', 'patterns', 'problem', 'solving', 'independently', 'small',
  'production', 'performance', 'optimization', 'design', 'schema', 'migrations',
  'real', 'time', 'processing', 'bot', 'clusters', 'cluster', 'in', 'on', 'at',
  'or', 'of', 'to', 'is', 'an', 'as', 'by', 'be', 'we'
]);

class FitScoreService {
  private resolveInferenceScript(): string | null {
    const candidates = [
      path.join(process.cwd(), 'src', 'python', 'fit_score_inference.py'),
      path.join(__dirname, '..', 'python', 'fit_score_inference.py')
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /** Parse model JSON from stdout (TF/libs sometimes print noise before the last JSON line). */
  private parseModelStdout(raw: string): { overallScore?: number; error?: string } | null {
    const text = raw.trim();
    if (!text) return null;
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      const line = lines[i];
      if (!line.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(line) as { overallScore?: number; error?: string };
        if (parsed.error) return parsed;
        if (parsed.overallScore !== undefined) return parsed;
      } catch {
        /* continue */
      }
    }
    try {
      return JSON.parse(text) as { overallScore?: number; error?: string };
    } catch {
      return null;
    }
  }

  private async modelOverallScore(resumeText: string, jobText: string): Promise<number | null> {
    const scriptPath = this.resolveInferenceScript();
    if (!scriptPath) {
      console.warn('[fitScoreService] ML script not found; using heuristic only.');
      return null;
    }

    const pythonExec = process.env.PYTHON_EXECUTABLE || 'python3';
    const timeoutMs = Number(process.env.FIT_SCORE_MODEL_TIMEOUT_MS) || 120000;

    return await new Promise<number | null>((resolve) => {
      const proc = spawn(pythonExec, [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env }
      });

      let stdout = '';
      let stderr = '';
      const timeout = setTimeout(() => {
        proc.kill('SIGKILL');
        console.warn('[fitScoreService] ML inference timed out after', timeoutMs, 'ms');
        resolve(null);
      }, timeoutMs);

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      proc.on('error', (err) => {
        clearTimeout(timeout);
        console.warn('[fitScoreService] ML spawn error:', err.message);
        resolve(null);
      });
      proc.on('close', (code) => {
        clearTimeout(timeout);
        const parsed = this.parseModelStdout(stdout);
        if (code !== 0 || !parsed || parsed.error !== undefined) {
          const hint = parsed?.error || stderr.trim() || stdout.trim().slice(0, 400);
          console.warn('[fitScoreService] ML model failed (exit', code, '):', hint);
          return resolve(null);
        }
        const value = Number(parsed.overallScore);
        if (!Number.isFinite(value)) {
          console.warn('[fitScoreService] ML returned non-numeric overallScore');
          return resolve(null);
        }
        resolve(Math.max(0, Math.min(100, value)));
      });

      const payload = JSON.stringify({
        resumeText: resumeText || ' ',
        jobText: jobText || ' '
      });
      proc.stdin.write(payload, 'utf8');
      proc.stdin.end();
    });
  }

  private roundPercent(value: number): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  private pickStableOverallScore(modelOverall: number | null, heuristicOverall: number): number {
    const h = Math.max(0, Math.min(100, heuristicOverall));
    if (modelOverall === null || !Number.isFinite(modelOverall)) {
      return Math.round(h);
    }

    // Guard against degenerate model outputs from out-of-distribution feature vectors.
    if (modelOverall <= 1 && h > 5) {
      return Math.round(h);
    }

    // Blend model with heuristic to keep UX stable while still using the ML model.
    const blended = h * 0.65 + modelOverall * 0.35;
    return Math.max(0, Math.min(100, Math.round(blended)));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9+#.\s]/g, ' ')
      .split(/\s+/)
      .map((word) => word.replace(/^[.]+|[.]+$/g, ''))
      .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  }

  private extractKeywordCounts(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const token of this.tokenize(text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return counts;
  }

  private topJobKeywords(jobText: string, limit = 20): string[] {
    const entries = Array.from(this.extractKeywordCounts(jobText).entries());
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword]) => keyword);
  }

  private extractYears(text: string): number {
    const matches = text.match(/(\d{1,2})\+?\s*(years?|yrs?)/gi) ?? [];
    const numbers = matches
      .map((match) => parseInt(match, 10))
      .filter((num) => Number.isFinite(num));
    if (numbers.length === 0) return 0;
    return Math.max(...numbers);
  }

  private degreeScore(resumeText: string, jobText: string): number {
    const degreeKeywords = ['bachelor', 'master', 'phd', 'degree', 'university'];
    const jobNeedsDegree = degreeKeywords.some((k) => jobText.toLowerCase().includes(k));
    if (!jobNeedsDegree) return 100;
    const resumeHasDegree = degreeKeywords.some((k) => resumeText.toLowerCase().includes(k));
    return resumeHasDegree ? 100 : 40;
  }

  async calculate(resumeText: string, jobText: string): Promise<ScoreBreakdown> {
    const jobKeywords = this.topJobKeywords(jobText, 24);
    const resumeKeywordSet = new Set(this.tokenize(resumeText));
    const matchedSkills = jobKeywords.filter((keyword) => resumeKeywordSet.has(keyword));
    const missingSkills = jobKeywords.filter((keyword) => !resumeKeywordSet.has(keyword));

    const skillsScore = jobKeywords.length
      ? (matchedSkills.length / jobKeywords.length) * 100
      : 0;

    const requiredYears = this.extractYears(jobText);
    const resumeYears = this.extractYears(resumeText);
    let experienceScore = 70;
    if (requiredYears > 0) {
      experienceScore = Math.min((resumeYears / requiredYears) * 100, 100);
    } else if (resumeYears > 0) {
      experienceScore = 90;
    }

    const educationScore = this.degreeScore(resumeText, jobText);
    const heuristicOverallScore =
      skillsScore * 0.6 +
      experienceScore * 0.25 +
      educationScore * 0.15;
    const modelOverall = await this.modelOverallScore(resumeText, jobText);
    const overallScore = this.pickStableOverallScore(modelOverall, heuristicOverallScore);

    return {
      overallScore: this.roundPercent(overallScore),
      skillsScore: this.roundPercent(skillsScore),
      experienceScore: this.roundPercent(experienceScore),
      educationScore: this.roundPercent(educationScore),
      matchedSkills: matchedSkills.slice(0, 12),
      missingSkills: missingSkills.slice(0, 12)
    };
  }
}

export default new FitScoreService();
