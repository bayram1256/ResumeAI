import http from 'http';
import https from 'https';

export type ResumeSuggestion = {
  id: string;
  title: string;
  reason: string;
  change: string;
  impact: 'high' | 'medium' | 'low';
};

type OpenAiChoice = {
  message?: {
    content?: string;
  };
};

type OpenAiResponse = {
  choices?: OpenAiChoice[];
};

/**
 * Words that appear frequently in job descriptions but are NOT skills.
 * fitScoreService.topJobKeywords() picks top-frequency tokens, many of which
 * are generic nouns/verbs, not technical skills worth highlighting.
 */
const NON_SKILL_TOKENS = new Set([
  'meeting', 'meetings', 'stage', 'multi', 'ability', 'strong', 'solid',
  'across', 'multiple', 'including', 'similar', 'patterns', 'problem',
  'solving', 'independently', 'production', 'performance', 'design',
  'schema', 'migrations', 'real', 'time', 'processing', 'bot', 'clusters',
  'cluster', 'environment', 'environments', 'systems', 'build', 'maintain',
  'implement', 'develop', 'manage', 'deliver', 'ownership', 'understanding',
  'proficiency', 'knowledge', 'hands', 'particularly', 'optimization',
  'communication', 'collaboration', 'documentation', 'responsibilities',
  'requirements', 'stakeholders', 'contribute', 'contributing', 'role',
  'candidate', 'ideal', 'looking', 'seeking', 'join', 'team', 'company',
  'ructured', 'logging', 'metes', 'sters', 'technic'  // common OCR/parse artefacts
]);

class AiSuggestionService {

  /** Model sometimes returns instructions instead of paste-ready resume lines. */
  private isMetaInstruction(text: string): boolean {
    const t = text.trim().toLowerCase();
    return (
      /^add\s/.test(t) ||
      /^include\s/.test(t) ||
      /^consider\s/.test(t) ||
      /^ensure\s/.test(t) ||
      /^update\s/.test(t) ||
      /^highlight\s/.test(t) ||
      /^try\s+to\s/.test(t) ||
      /^need\s+to\s/.test(t) ||
      /add\s+a\s+concise\s+bullet/.test(t) ||
      /proving\s+hands-?on\s+work\s+with/.test(t) ||
      /^you\s+should\s/.test(t)
    );
  }

  /**
   * Filter fitScoreService keyword tokens to only plausible tech/professional skills.
   * Removes noise words, very short tokens, and obvious non-skills.
   */
  private filterToRealSkills(rawSkills: string[]): string[] {
    return rawSkills.filter((skill) => {
      const s = skill.toLowerCase();
      if (NON_SKILL_TOKENS.has(s)) return false;
      if (skill.length < 3) return false;
      // Reject tokens that look like random word fragments (no vowels, etc.)
      if (!/[aeiou]/i.test(skill)) return false;
      return true;
    });
  }

  /**
   * Extract role context from the job description SAFELY.
   * Only use explicit labeled fields (Position:, Role:, Job Title:).
   * NEVER grab random capitalized lines — they are often marketing copy.
   */
  private extractJobContext(jobText: string): { roleHint: string; domainHint: string } {
    const titleMatch = jobText.match(
      /(?:position|role|title|job\s+title|we['']?re\s+hiring\s+a|we['']?re\s+looking\s+for\s+a?)[:\s]+([^\n.•\|]{5,55})/i
    );
    let roleHint = titleMatch ? titleMatch[1].trim() : '';

    // Discard anything that looks like marketing/company copy
    if (/join|pivot|career|opportunity|high.?impact|we are|our team|startup|company|3-person|high impact/i.test(roleHint)) {
      roleHint = '';
    }
    if (roleHint.length > 55 || /[•\|@]/.test(roleHint)) {
      roleHint = '';
    }

    // Domain keywords are safe to use
    const domainKeywords = jobText.match(
      /\b(saas|fintech|e-?commerce|healthcare|edtech|logistics|cloud|mobile|embedded|devops|platform|enterprise|b2b|b2c)\b/gi
    );
    const domainHint = domainKeywords
      ? [...new Set(domainKeywords.map((k) => k.toLowerCase()))].slice(0, 2).join('/')
      : '';

    return { roleHint, domainHint };
  }

  /**
   * Build a concrete resume bullet using CATEGORIZED TEMPLATES only.
   * NEVER embed raw snippets from the job description text — it is often
   * noisy, garbled by PDF parsing, or contains marketing copy.
   */
  private buildJobSpecificBullet(skill: string, jobText: string): string {
    const { roleHint, domainHint } = this.extractJobContext(jobText);
    const ctx = [roleHint, domainHint].filter(Boolean).join(' ');
    const envPhrase = ctx ? ` in a ${ctx} environment` : '';
    const forPhrase = ctx ? ` for ${ctx} workloads` : '';
    const s = skill.toLowerCase();

    // Container / Orchestration
    if (/kubernetes|k8s|helm|argocd|istio|ecs|eks|gke/.test(s))
      return `Managed containerised microservices with ${skill}${envPhrase}, achieving zero-downtime deployments and reducing release cycle by 40%.`;

    if (/docker|podman|containerd/.test(s))
      return `Containerised services with ${skill}${envPhrase}, standardising local-to-production parity and cutting environment setup time.`;

    // CI/CD & DevOps tooling
    if (/ci\/?cd|github.?actions|gitlab.?ci|jenkins|circleci|teamcity|argo.?cd/.test(s))
      return `Built and maintained ${skill} pipelines${envPhrase}, enabling continuous delivery and cutting manual release effort by over 50%.`;

    if (/terraform|ansible|pulumi|cloudformation|iac/.test(s))
      return `Automated infrastructure provisioning with ${skill}${envPhrase}, reducing environment setup from days to under 30 minutes.`;

    if (/infrastructure/.test(s))
      return `Designed and maintained scalable infrastructure${envPhrase}, supporting high-availability services and automated deployments.`;

    if (/monitoring|grafana|prometheus|datadog|newrelic|observability/.test(s))
      return `Implemented observability with ${skill}${envPhrase}, reducing mean time to detection for production incidents by 60%.`;

    // Cloud
    if (/\baws\b|amazon\s+web/.test(s))
      return `Designed and operated AWS infrastructure (EC2, RDS, Lambda, S3)${forPhrase}, achieving 99.9% uptime SLA and optimising cost by 25%.`;

    if (/\bazure\b/.test(s))
      return `Deployed and managed Azure services${forPhrase}, implementing autoscaling and cost-optimisation strategies.`;

    if (/\bgcp\b|google\s+cloud/.test(s))
      return `Architected GCP solutions${forPhrase}, leveraging BigQuery and Cloud Run to cut pipeline latency by 35%.`;

    if (/\bcloud\b/.test(s))
      return `Led cloud migration and architecture${envPhrase}, improving scalability and reducing infrastructure cost by 30%.`;

    // Languages
    if (/\bpython\b/.test(s))
      return `Developed Python services and automation tooling${envPhrase}, improving data processing throughput and reducing operational toil.`;

    if (/typescript/.test(s))
      return `Built TypeScript services${envPhrase}, applying strict typing and comprehensive testing to reduce runtime errors by 45%.`;

    if (/javascript|node\.?js/.test(s))
      return `Developed Node.js / JavaScript applications${envPhrase}, improving API response time and test coverage.`;

    if (/golang|go\b/.test(s))
      return `Implemented high-throughput Go microservices${envPhrase}, handling 10K+ RPS with sub-10 ms p99 latency.`;

    if (/\bjava\b/.test(s))
      return `Delivered Java backend services${envPhrase}, refactoring legacy modules to reduce response time by 30%.`;

    // Data / Databases
    if (/postgres|postgresql|mysql|mariadb/.test(s))
      return `Designed and optimised ${skill} schemas and query plans${envPhrase}, improving critical-path queries by over 50%.`;

    if (/mongodb|cassandra|dynamodb|nosql/.test(s))
      return `Modelled and scaled ${skill} data stores${envPhrase}, enabling horizontal sharding to support 5× data growth.`;

    if (/redis|memcached|cache/.test(s))
      return `Introduced ${skill} caching layer${envPhrase}, reducing database load by 70% and improving API response time.`;

    if (/kafka|rabbitmq|pubsub|messaging|queue/.test(s))
      return `Architected event-driven pipelines with ${skill}${envPhrase}, decoupling services and improving fault tolerance.`;

    if (/\bsql\b|database/.test(s))
      return `Optimised SQL queries and database schemas${envPhrase}, achieving significant performance improvements on high-traffic endpoints.`;

    // Architecture
    if (/architect|system\s+design/.test(s))
      return `Led system architecture decisions${envPhrase}, defining scalable patterns adopted as engineering standards across the team.`;

    if (/microservice|micro-service/.test(s))
      return `Decomposed monolithic systems into microservices${envPhrase}, enabling independent deployment and reducing release cycle time.`;

    if (/api|rest|graphql|grpc/.test(s))
      return `Designed and documented ${skill.toUpperCase()} APIs${envPhrase}, improving developer experience and reducing integration errors.`;

    // Scaling & Performance
    if (/scal|scaling/.test(s))
      return `Implemented autoscaling and load-balancing${envPhrase}, handling 3× traffic growth without service degradation.`;

    if (/performance|optimis|optimiz/.test(s))
      return `Profiled and optimised application performance${envPhrase}, reducing p95 latency by 35% and cutting infrastructure spend.`;

    // ML/AI
    if (/machine.?learning|ml\b|\bai\b|deep.?learning|pytorch|tensorflow|llm/.test(s))
      return `Built and deployed ${skill} models${envPhrase}, integrating predictions into the product to improve user outcomes.`;

    // Security
    if (/security|oauth|jwt|auth|sso/.test(s))
      return `Implemented ${skill}-based security controls${envPhrase}, hardening the authentication layer and contributing to SOC 2 readiness.`;

    // Leadership / Process
    if (/lead|manag|mentor/.test(s))
      return `Mentored engineers and led delivery of key initiatives${envPhrase}, improving team velocity and code quality.`;

    if (/agile|scrum|kanban|sprint/.test(s))
      return `Drove agile ceremonies and delivery discipline${envPhrase}, maintaining consistent sprint velocity and reducing cycle time.`;

    // Generic — clean, no raw job text ever inserted
    return `Applied ${skill} expertise${envPhrase} to deliver production-ready solutions, improving reliability and engineering throughput.`;
  }

  /** Repair an AI meta-instruction into a concrete bullet using job-specific templates. */
  private liftConcreteChange(
    change: string,
    title: string,
    reason: string,
    jobText: string
  ): string {
    let c = (change || '').trim().replace(/^[•\-\*\s\u2022]+/u, '').trim();
    if (!c) return 'Strengthened relevant experience with measurable outcomes aligned to the role.';
    if (!this.isMetaInstruction(c)) return c;

    // Try to extract a skill name from the meta-instruction text
    const withMatch = c.match(/with\s+([a-z0-9][a-z0-9\s\-+.#/]*?)\s*\.?\s*$/i);
    const aboutMatch = c.match(/about\s+([a-z0-9][a-z0-9\s\-+.#/]*?)\s*\.?\s*$/i);
    const forMatch =
      title.match(/(?:for|show|add)\s+([^.,;]+?)\s*$/i) ||
      reason.match(/(?:emphasizes|requires|mentions|needs)\s+([^.,;]+)/i);
    const skill = (withMatch?.[1] || aboutMatch?.[1] || forMatch?.[1] || '').trim();

    if (skill) return this.buildJobSpecificBullet(skill, jobText);
    return 'Strengthened relevant experience with measurable outcomes aligned to the role.';
  }

  private normalizeSuggestions(input: ResumeSuggestion[], jobText: string): ResumeSuggestion[] {
    return input.slice(0, 8).map((item, index) => ({
      id: item.id || `ai-${index + 1}`,
      title: item.title || 'Resume improvement',
      reason: item.reason || 'Improve relevance for target role',
      change: this.liftConcreteChange(
        item.change || '',
        item.title || '',
        item.reason || '',
        jobText
      ),
      impact: item.impact === 'high' || item.impact === 'low' ? item.impact : 'medium'
    }));
  }

  private provider(): string {
    return (process.env.AI_PROVIDER || 'heuristic').toLowerCase();
  }

  private async callOllama(prompt: string): Promise<string> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const url = new URL(baseUrl);
    const payload = JSON.stringify({
      model,
      stream: false,
      prompt: ['Return ONLY valid JSON array.', 'Each item: id, title, reason, change, impact.', prompt].join('\n')
    });
    const client = url.protocol === 'https:' ? https : http;
    return new Promise<string>((resolve, reject) => {
      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: '/api/generate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        },
        (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode >= 300)
              return reject(new Error(`Ollama failed: ${res.statusCode}`));
            try { resolve((JSON.parse(body) as { response?: string }).response || '[]'); }
            catch (e) { reject(e); }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Hugging Face chat completions (OpenAI-compatible).
   * Uses router.huggingface.co/v1/chat/completions — api-inference.huggingface.co does NOT expose this path (404).
   * Retries on 503 "model loading" with the suggested wait time.
   */
  private async callHuggingFace(prompt: string): Promise<string> {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not configured');
    const model = process.env.HUGGINGFACE_MODEL || 'HuggingFaceH4/zephyr-7b-beta';

    const messages = [
      {
        role: 'system' as const,
        content: [
          'You are a professional resume writer. Return ONLY a valid JSON array — no markdown, no explanation.',
          'Each item: id (string), title (short phrase), reason (one sentence), change (string), impact (high|medium|low).',
          '',
          '=== CRITICAL: "change" field rules ===',
          'Must be ONE finished resume bullet point to paste into a CV.',
          'Must reference real tools/technologies/outcomes from the job description.',
          'Use past-tense action verb + specific technology + measurable result.',
          '',
          'FORBIDDEN (never write these):',
          '  "Add a bullet about X" | "Include experience with Y" | "Consider highlighting Z"',
          '  Any sentence starting with: Add, Include, Consider, Update, Ensure, Highlight, Try, Need',
          '',
          'CORRECT examples:',
          '  "Orchestrated 15-service Kubernetes platform on EKS, achieving 99.95% uptime."',
          '  "Automated Terraform infrastructure across 3 AWS environments, cutting setup from 3h to 8min."'
        ].join('\n')
      },
      {
        role: 'user' as const,
        content: `Return ONLY a JSON array. Each item: id, title, reason, change, impact.\n\n${prompt}`
      }
    ];

    const payload = JSON.stringify({ model, messages, max_tokens: 900, temperature: 0.15 });

    const doRequest = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'router.huggingface.co',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              Authorization: `Bearer ${apiKey}`
            }
          },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
              // 503 = model is cold-starting — caller will retry
              if (res.statusCode === 503) {
                let waitMs = 25000;
                try {
                  const parsed = JSON.parse(body) as { estimated_time?: number };
                  if (parsed.estimated_time) waitMs = Math.ceil(parsed.estimated_time) * 1000 + 2000;
                } catch { /* keep default */ }
                return reject(Object.assign(new Error(`HF_503_LOADING`), { retryAfterMs: waitMs }));
              }
              if (!res.statusCode || res.statusCode >= 300) {
                const hint = body.slice(0, 300);
                console.error(`[aiSuggestionService] HuggingFace error ${res.statusCode}: ${hint}`);
                return reject(new Error(`HF router failed: ${res.statusCode} — ${hint}`));
              }
              try {
                const parsed = JSON.parse(body) as OpenAiResponse;
                const content = parsed.choices?.[0]?.message?.content ?? '[]';
                resolve(typeof content === 'string' ? content : '[]');
              } catch (e) { reject(e); }
            });
          }
        );
        req.on('error', (e) => {
          console.error('[aiSuggestionService] HuggingFace network error:', e.message);
          reject(e);
        });
        req.write(payload);
        req.end();
      });

    // Retry loop — handles cold-start 503 up to 2 times
    const customBase = process.env.HUGGINGFACE_CHAT_BASE_URL?.replace(/\/$/, '');
    if (customBase) {
      // Custom base URL (e.g. local proxy) — single shot, no retry
      const u = new URL(`${customBase}/v1/chat/completions`);
      return new Promise((resolve, reject) => {
        const req = https.request(
          { hostname: u.hostname, path: u.pathname + u.search, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${apiKey}` } },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
              if (!res.statusCode || res.statusCode >= 300) return reject(new Error(`Custom HF base failed: ${res.statusCode}`));
              try { resolve((JSON.parse(body) as OpenAiResponse).choices?.[0]?.message?.content ?? '[]'); }
              catch (e) { reject(e); }
            });
          }
        );
        req.on('error', reject);
        req.write(payload);
        req.end();
      });
    }

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await doRequest();
      } catch (err: any) {
        if (err?.message === 'HF_503_LOADING' && attempt < 3) {
          const waitMs: number = err.retryAfterMs ?? 25000;
          console.log(`[aiSuggestionService] HF model loading (attempt ${attempt}/3), waiting ${Math.round(waitMs / 1000)}s…`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error('HuggingFace: model did not load after 3 attempts');
  }

  private stripToPlainLetter(text: string): string {
    let t = text.trim();
    // Remove markdown code fences
    const fence = /^```(?:\w*\n)?([\s\S]*?)```$/m.exec(t);
    if (fence) t = fence[1].trim();
    // Remove common model echoes / preambles
    t = t.replace(/^\s*Subject:.*\n/im, '');
    t = t.replace(/^\s*(?:Sure|Of course|Here(?:'s| is)(?: your| the| a)?)[\s\S]{0,80}?\n/i, '');
    t = t.replace(/^\s*(?:Cover Letter|COVER LETTER)\s*\n+/i, '');
    // Remove markdown headers like ## Cover Letter
    t = t.replace(/^#+\s+.+\n/gm, '');
    // Remove assistant role echoes like "[INST]..." or "<<SYS>>..."
    t = t.replace(/\[INST\][\s\S]*?\[\/INST\]/g, '');
    t = t.replace(/<<SYS>>[\s\S]*?<\/SYS>>/g, '');
    return t.trim();
  }

  /**
   * Enforce baseline cover-letter structure for downstream UX consistency.
   * - Always starts with "Dear Hiring Manager,"
   * - Always ends with "Sincerely," + "[Your Name]"
   */
  private normalizeCoverLetterShape(text: string): string {
    let t = text.trim();
    if (!t) return t;

    // Normalize whitespace/newlines first.
    t = t.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    // Ensure salutation at top.
    if (!/^dear hiring manager,/i.test(t)) {
      t = `Dear Hiring Manager,\n\n${t}`;
    }

    // Remove duplicate sign-off blocks before re-appending a single canonical one.
    t = t
      .replace(/\n*\s*(?:best regards|kind regards|regards|sincerely),?\s*\n+\s*(?:\[?your name\]?|[a-z .'-]{2,})\s*$/i, '')
      .trim();

    return `${t}\n\nSincerely,\n[Your Name]`;
  }

  /** Light parse of posting for a template letter — never paste posting prose. */
  private extractCoverLetterContext(jobText: string): {
    company: string;
    roleLabel: string;
    skillPhrases: string[];
  } {
    const flat = jobText.replace(/\s+/g, ' ').trim();
    let company = 'your organization';
    const isA = /^([\w.-]+)\s+is a\b/i.exec(flat);
    if (isA && isA[1].length >= 2 && isA[1].length <= 48) company = isA[1];
    else {
      const firstLine = jobText.trim().split(/\r?\n/)[0] ?? '';
      const fw = /^([\w.-]+)\b/.exec(firstLine.trim());
      if (fw && /^[A-Z0-9]/.test(fw[1]) && fw[1].length >= 2 && fw[1].length <= 48) {
        company = fw[1];
      }
    }

    let roleLabel = 'this position';
    const teamM = /(?:extend our|join (?:our|the) )\s*([^.\n]+?)\s+team\b/i.exec(jobText);
    if (teamM) roleLabel = teamM[1].trim();
    const titled = /\b(Backend|Front[- ]?end|Full[- ]?stack|Senior|Staff|Lead)\s+(?:Software\s+)?(?:Developer|Engineer)\b/i.exec(
      jobText
    );
    if (titled) roleLabel = titled[0];

    const pairs: [RegExp, string][] = [
      [/Node\.?js|NodeJS/i, 'Node.js'],
      [/TypeScript/i, 'TypeScript'],
      [/NestJS/i, 'NestJS'],
      [/Docker/i, 'Docker'],
      [/DevOps/i, 'DevOps'],
      [/\bREST(?:ful)?\s+API/i, 'REST APIs'],
      [/PostgreSQL|MySQL|SQL databases/i, 'relational databases'],
      [/ORM|Drizzle/i, 'ORMs and schema design'],
      [/GraphQL/i, 'GraphQL'],
      [/Redis|RabbitMQ|Elasticsearch/i, 'messaging and search stacks'],
      [/Kubernetes|Helm|KEDA|HPA/i, 'cloud-native ops'],
      [/\bGit\b/i, 'Git'],
      [/Unix|Linux/i, 'Unix/Linux environments'],
      [/open source/i, 'open-source collaboration'],
      [/AI-assisted|AI assisted/i, 'AI-assisted development workflows']
    ];
    const skillPhrases: string[] = [];
    for (const [re, label] of pairs) {
      if (re.test(jobText) && !skillPhrases.includes(label)) skillPhrases.push(label);
      if (skillPhrases.length >= 7) break;
    }

    return { company, roleLabel, skillPhrases };
  }

  /**
   * True ONLY if the letter contains a very long sentence (80+ chars) copied
   * verbatim from the posting. Avoids false-positives on legitimate paraphrasing.
   */
  private postingSeemsQuotedVerbatim(letter: string, jobText: string): boolean {
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const L = norm(letter);
    if (L.length < 60) return false;

    // Only check complete sentences long enough to be meaningful copies (80+ chars)
    const sentences = jobText
      .split(/(?<=[.!?])\s+/)
      .map(norm)
      .filter((s) => s.length >= 80);

    for (const sentence of sentences.slice(0, 8)) {
      if (L.includes(sentence)) return true;
    }
    return false;
  }

  /** Heuristic cover letter when no LLM — inferred themes only, no pasted posting text. */
  private fallbackCoverLetterFromJob(jobText: string, resumeText?: string): string {
    const { company, roleLabel, skillPhrases } = this.extractCoverLetterContext(jobText);

    // If resume is available, extract candidate name and a summary of their experience
    let candidateSummary = '';
    if (resumeText && resumeText.trim().length > 50) {
      const firstLine = resumeText.trim().split(/\n/)[0] ?? '';
      const nameCandidate = firstLine.replace(/[^a-zA-Z\s]/g, '').trim();
      if (nameCandidate.length >= 3 && nameCandidate.length <= 50 && /^[A-Z]/.test(nameCandidate)) {
        candidateSummary = nameCandidate;
      }
      // Pull years of experience if mentioned
      const yearsMatch = resumeText.match(/(\d{1,2})\+?\s*(?:years?|yrs?)/i);
      if (yearsMatch) {
        const yrs = parseInt(yearsMatch[1], 10);
        if (yrs > 0 && yrs <= 30) {
          candidateSummary += candidateSummary ? '' : '';
        }
      }
    }

    const skillLine =
      skillPhrases.length > 0
        ? `My background aligns with your requirements, particularly in ${this.joinPhrases(skillPhrases)}.`
        : 'My background includes backend and API development, data persistence, and shipping reliable services in production.';

    return [
      'Dear Hiring Manager,',
      '',
      `I am writing to express my interest in the ${roleLabel} role at ${company}. I am motivated by building robust, maintainable systems and collaborating with teams that value engineering quality.`,
      '',
      skillLine,
      '',
      'I am confident I can contribute meaningfully from day one and would welcome the opportunity to discuss how my experience fits your team\'s needs.',
      '',
      'Thank you for your time and consideration.',
      '',
      'Sincerely,',
      candidateSummary || '[Your Name]'
    ].join('\n');
  }

  private joinPhrases(items: string[]): string {
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
  }

  /**
   * Same as callHuggingFace but for plain-text cover letters (router chat completions).
   */
  private async callHuggingFaceCover(userPrompt: string): Promise<string> {
    const apiKey = process.env.HUGGINGFACE_API_KEY;
    if (!apiKey) throw new Error('HUGGINGFACE_API_KEY not configured');
    const model = process.env.HUGGINGFACE_MODEL || 'HuggingFaceH4/zephyr-7b-beta';

    const messages = [
      {
        role: 'system' as const,
        content: [
          'You write professional job application cover letters. Output ONLY the plain text letter — nothing else.',
          'Format: salutation line, blank line, paragraph 1, blank line, paragraph 2, blank line, paragraph 3, blank line, "Sincerely,", blank line, "[Your Name]".',
          'No markdown, no JSON, no subject line, no preamble, no explanation, no bullet points.',
          'Do NOT copy sentences from the job posting. Paraphrase requirements as your own strengths.',
          'Keep under 220 words.'
        ].join(' ')
      },
      { role: 'user' as const, content: userPrompt }
    ];

    const payload = JSON.stringify({ model, messages, max_tokens: 700, temperature: 0.4 });

    const doRequest = (): Promise<string> =>
      new Promise((resolve, reject) => {
        const req = https.request(
          {
            hostname: 'router.huggingface.co',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
              Authorization: `Bearer ${apiKey}`
            }
          },
          (res) => {
            let body = '';
            res.on('data', (c) => { body += c; });
            res.on('end', () => {
              if (res.statusCode === 503) {
                let waitMs = 25000;
                try {
                  const parsed = JSON.parse(body) as { estimated_time?: number };
                  if (parsed.estimated_time) waitMs = Math.ceil(parsed.estimated_time) * 1000 + 2000;
                } catch { /* keep default */ }
                return reject(Object.assign(new Error('HF_503_LOADING'), { retryAfterMs: waitMs }));
              }
              if (!res.statusCode || res.statusCode >= 300) {
                const hint = body.slice(0, 300);
                console.error(`[aiSuggestionService] HuggingFace cover error ${res.statusCode}: ${hint}`);
                return reject(new Error(`HF router cover failed: ${res.statusCode} — ${hint}`));
              }
              try {
                const parsed = JSON.parse(body) as OpenAiResponse;
                const content = parsed.choices?.[0]?.message?.content ?? '';
                resolve(typeof content === 'string' ? content : '');
              } catch (e) { reject(e); }
            });
          }
        );
        req.on('error', (e) => {
          console.error('[aiSuggestionService] HuggingFace cover network error:', e.message);
          reject(e);
        });
        req.write(payload);
        req.end();
      });

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        return await doRequest();
      } catch (err: any) {
        if (err?.message === 'HF_503_LOADING' && attempt < 3) {
          const waitMs: number = err.retryAfterMs ?? 25000;
          console.log(`[aiSuggestionService] HF model loading (cover, attempt ${attempt}/3), waiting ${Math.round(waitMs / 1000)}s…`);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error('HuggingFace: model did not load after 3 attempts');
  }

  private async callOpenAiPlain(system: string, user: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const payload = JSON.stringify({
      model,
      temperature: 0.35,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });
    return new Promise<string>((resolve, reject) => {
      const req = https.request(
        {
          hostname: 'api.openai.com',
          path: '/v1/chat/completions',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Authorization: `Bearer ${apiKey}`
          }
        },
        (res) => {
          let body = '';
          res.on('data', (c) => {
            body += c;
          });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode >= 300)
              return reject(new Error(`OpenAI failed: ${res.statusCode}`));
            try {
              const parsed = JSON.parse(body) as OpenAiResponse;
              const content = parsed.choices?.[0]?.message?.content ?? '';
              resolve(typeof content === 'string' ? content : '');
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  private async callOllamaPlain(userPrompt: string): Promise<string> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2';
    const url = new URL(baseUrl);
    const fullPrompt = [
      'Write a professional cover letter in plain text only (no JSON).',
      'Include salutation, body, Sincerely, and [Your Name].',
      '',
      userPrompt
    ].join('\n');
    const payload = JSON.stringify({
      model,
      stream: false,
      prompt: fullPrompt
    });
    const client = url.protocol === 'https:' ? https : http;
    return new Promise<string>((resolve, reject) => {
      const req = client.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: '/api/generate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
        },
        (res) => {
          let body = '';
          res.on('data', (c) => {
            body += c;
          });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode >= 300)
              return reject(new Error(`Ollama failed: ${res.statusCode}`));
            try {
              resolve((JSON.parse(body) as { response?: string }).response ?? '');
            } catch (e) {
              reject(e);
            }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  /**
   * Plain-text cover letter.
   * When resumeText is provided the letter is personalised with the candidate's real experience.
   * Same AI_PROVIDER env var as resume suggestions (huggingface / openai / ollama / heuristic).
   */
  async generateCoverLetterFromJob(jobText: string, resumeText?: string): Promise<string> {
    const { company, roleLabel, skillPhrases } = this.extractCoverLetterContext(jobText);
    const hasResume = !!resumeText && resumeText.trim().length > 80;

    // Build a structured user prompt that works well even with small 7B models
    const lines: string[] = [];

    if (hasResume) {
      lines.push(
        `Write a concise, professional cover letter for the "${roleLabel}" role at ${company || 'the company'}.`,
        'Use the candidate\'s resume below to personalise the letter with real experience and skills.',
        'Do NOT copy sentences from the job posting or the resume — paraphrase into original prose.',
        'Output ONLY the letter (salutation, 3 short paragraphs, "Sincerely,", "[Your Name]"). No markdown, no subject line.',
        '',
        '=== CANDIDATE RESUME (use for personalisation) ===',
        resumeText!.slice(0, 2500),
        '',
        '=== JOB POSTING (reference only — do not copy) ===',
        jobText.slice(0, 3000)
      );
    } else {
      const skillsHint = skillPhrases.length > 0
        ? `The role emphasises: ${skillPhrases.slice(0, 5).join(', ')}.`
        : '';
      lines.push(
        `Write a concise, professional cover letter for the "${roleLabel}" position at ${company || 'the company'}.`,
        'The candidate has not provided a resume — write plausible first-person strengths that match the role.',
        'Do NOT copy or quote sentences from the posting. Keep under 220 words.',
        'Output ONLY the letter (salutation, 3 short paragraphs, "Sincerely,", "[Your Name]"). No markdown, no subject line.',
        skillsHint,
        '',
        '=== JOB POSTING (reference only — do not copy) ===',
        jobText.slice(0, 4000)
      );
    }

    const userPrompt = lines.filter(l => l !== null).join('\n');
    const provider = this.provider();

    if (provider === 'heuristic') {
      return this.fallbackCoverLetterFromJob(jobText, resumeText);
    }

    const system = hasResume
      ? 'You are an expert career writer. Personalise the cover letter using the candidate\'s real resume. Never quote the job posting verbatim. Plain text only: salutation, body paragraphs, Sincerely, [Your Name]. No JSON or markdown.'
      : 'You are an expert career writer. Infer reasonable candidate fit from the job posting only. Never quote the job posting verbatim. Plain text only: salutation, body paragraphs, Sincerely, [Your Name]. No JSON or markdown.';

    try {
      let raw: string;
      if (provider === 'ollama') raw = await this.callOllamaPlain(userPrompt);
      else if (provider === 'huggingface') raw = await this.callHuggingFaceCover(userPrompt);
      else raw = await this.callOpenAiPlain(system, userPrompt);

      const cleaned = this.normalizeCoverLetterShape(this.stripToPlainLetter(raw));
      if (cleaned.length < 120 || this.postingSeemsQuotedVerbatim(cleaned, jobText)) {
        console.warn('[aiSuggestionService] cover letter quality check failed, using fallback');
        return this.fallbackCoverLetterFromJob(jobText, resumeText);
      }
      return cleaned;
    } catch (error) {
      console.warn('[aiSuggestionService] generateCoverLetterFromJob failed, using fallback:', error);
      return this.fallbackCoverLetterFromJob(jobText, resumeText);
    }
  }

  private extractJsonBlock(text: string): string {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start >= 0 && end > start) return text.slice(start, end + 1);
    return '[]';
  }

  private fallbackSuggestions(missingSkills: string[], jobText: string): ResumeSuggestion[] {
    const realSkills = this.filterToRealSkills(missingSkills);

    if (realSkills.length === 0) {
      const { roleHint, domainHint } = this.extractJobContext(jobText);
      const ctx = [roleHint, domainHint].filter(Boolean).join(' ');
      return [{
        id: 'fallback-1',
        title: 'Quantify your impact',
        reason: 'No critical skill gaps detected; measurable outcomes are the highest-value improvement.',
        change: ctx
          ? `Quantified outcomes for ${ctx} work — reduced latency by X%, improved throughput by Y%, or grew user base by Z%.`
          : 'Added measurable results to key bullets: percentages, time saved, revenue impacted, or user scale achieved.',
        impact: 'medium'
      }];
    }

    return realSkills.slice(0, 5).map((skill, index) => ({
      id: `fallback-${index + 1}`,
      title: `Show ${skill} in action`,
      reason: `The job description requires ${skill}; a concrete achievement will demonstrate this competency.`,
      change: this.buildJobSpecificBullet(skill, jobText),
      impact: index < 2 ? 'high' : 'medium'
    }));
  }

  private async callOpenAi(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const payload = JSON.stringify({
      model, temperature: 0.3,
      messages: [
        { role: 'system', content: 'Resume optimization assistant. Return ONLY valid JSON array. Each "change" must be a finished bullet, never an instruction like "Add a bullet about X".' },
        { role: 'user', content: prompt }
      ]
    });
    return new Promise<string>((resolve, reject) => {
      const req = https.request(
        { hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${apiKey}` } },
        (res) => {
          let body = '';
          res.on('data', (c) => { body += c; });
          res.on('end', () => {
            if (!res.statusCode || res.statusCode >= 300)
              return reject(new Error(`OpenAI failed: ${res.statusCode}`));
            try {
              const parsed = JSON.parse(body) as OpenAiResponse;
              resolve(parsed.choices?.[0]?.message?.content ?? '[]');
            } catch (e) { reject(e); }
          });
        }
      );
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  async generate(
    resumeText: string,
    jobText: string,
    missingSkills: string[]
  ): Promise<ResumeSuggestion[]> {
    const realMissingSkills = this.filterToRealSkills(missingSkills);
    const { roleHint, domainHint } = this.extractJobContext(jobText);
    const roleContext = [roleHint, domainHint].filter(Boolean).join(', ');

    const prompt = [
      'Analyze the resume vs the job description. Propose up to 8 concrete improvements.',
      '',
      '=== RULES FOR "change" FIELD ===',
      '1. Final resume bullet the candidate pastes in — NOT instructions.',
      `2. Reference tools/technologies/outcomes from THIS job${roleContext ? ` (${roleContext})` : ''}.`,
      '3. Past-tense verb + specific tech + measurable result.',
      '4. NEVER: Add, Include, Consider, Update, Ensure, Highlight, Try, Need.',
      '',
      'GOOD → "Orchestrated 15-service Kubernetes platform, reducing deploy time by 40%."',
      'BAD  → "Add a bullet about Kubernetes experience."',
      '',
      'JSON: [{ id, title, reason, change, impact: "high"|"medium"|"low" }]',
      '',
      `Missing skills: ${realMissingSkills.join(', ') || 'none identified'}`,
      '',
      `Resume:\n${resumeText.slice(0, 4000)}`,
      '',
      `Job Description:\n${jobText.slice(0, 4000)}`
    ].join('\n');

    const provider = this.provider();
    if (provider === 'heuristic') return this.fallbackSuggestions(realMissingSkills, jobText);

    try {
      const raw =
        provider === 'ollama' ? await this.callOllama(prompt)
        : provider === 'huggingface' ? await this.callHuggingFace(prompt)
        : await this.callOpenAi(prompt);

      const jsonBlock = this.extractJsonBlock(raw);
      const parsed = JSON.parse(jsonBlock) as ResumeSuggestion[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return this.fallbackSuggestions(realMissingSkills, jobText);
      }
      return this.normalizeSuggestions(parsed, jobText);
    } catch (error) {
      console.warn('[aiSuggestionService] provider failed, using heuristic fallback:', error);
      return this.fallbackSuggestions(realMissingSkills, jobText);
    }
  }
}

export default new AiSuggestionService();
