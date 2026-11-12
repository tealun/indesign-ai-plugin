import type {
  AgentMemoryRoot,
  ExperienceNote,
  ExperienceScope,
  ProjectMemory,
  TaskStat,
} from "./types.js";

const STORAGE_KEY = "indesign-ai.agentMemory.v1";

function nowIso(): string {
  return new Date().toISOString();
}

function newNoteId(): string {
  return `n-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

export function emptyMemory(): AgentMemoryRoot {
  const ts = nowIso();
  return {
    version: 1,
    agentLessons: [
      {
        id: "seed-m0t-1",
        scope: "agent",
        text: "矢量伪表恢复时：先锁定选区再识图；replace 必须用文档真实表样式；失败时保留原矢量。",
        taskId: "m0t.vector_table_recover",
        createdAt: ts,
        hits: 1,
      },
      {
        id: "seed-m0t-2",
        scope: "agent",
        text: "用户只回样式名且 hasDraft=true 时，应走 m0t.replace_with_style，不要说听不懂。",
        taskId: "m0t.replace_with_style",
        createdAt: ts,
        hits: 1,
      },
    ],
    user: {
      preferredLocale: "zh-CN",
      lessons: [],
      updatedAt: ts,
    },
    projects: {},
  };
}

export function loadMemory(): AgentMemoryRoot {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return emptyMemory();
    const parsed = JSON.parse(raw) as AgentMemoryRoot;
    if (parsed?.version !== 1) return emptyMemory();
    return {
      ...emptyMemory(),
      ...parsed,
      user: { ...emptyMemory().user, ...parsed.user },
      projects: parsed.projects || {},
      agentLessons: parsed.agentLessons?.length
        ? parsed.agentLessons
        : emptyMemory().agentLessons,
    };
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(root: AgentMemoryRoot): void {
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(root));
}

export function getOrCreateProject(
  root: AgentMemoryRoot,
  identity: { key: string; name: string; path?: string },
): ProjectMemory {
  const existing = root.projects[identity.key];
  if (existing) {
    existing.documentName = identity.name;
    if (identity.path) existing.documentPath = identity.path;
    existing.updatedAt = nowIso();
    return existing;
  }
  const created: ProjectMemory = {
    key: identity.key,
    documentName: identity.name,
    ...(identity.path ? { documentPath: identity.path } : {}),
    lessons: [],
    taskStats: {},
    digests: [],
    updatedAt: nowIso(),
  };
  root.projects[identity.key] = created;
  return created;
}

export function rememberNote(
  root: AgentMemoryRoot,
  args: {
    scope: ExperienceScope;
    text: string;
    taskId?: string;
    projectKey?: string;
  },
): ExperienceNote {
  const note: ExperienceNote = {
    id: newNoteId(),
    scope: args.scope,
    text: args.text.trim(),
    createdAt: nowIso(),
    hits: 1,
    ...(args.taskId ? { taskId: args.taskId } : {}),
    ...(args.projectKey ? { projectKey: args.projectKey } : {}),
  };
  if (!note.text) return note;

  if (args.scope === "agent") {
    root.agentLessons = dedupePush(root.agentLessons, note).slice(-40);
  } else if (args.scope === "user") {
    root.user.lessons = dedupePush(root.user.lessons, note).slice(-40);
    root.user.updatedAt = nowIso();
  } else if (args.scope === "project" || args.scope === "task") {
    const key = args.projectKey;
    if (key && root.projects[key]) {
      root.projects[key]!.lessons = dedupePush(
        root.projects[key]!.lessons,
        note,
      ).slice(-60);
      root.projects[key]!.updatedAt = nowIso();
    }
  }
  saveMemory(root);
  return note;
}

function dedupePush(list: ExperienceNote[], note: ExperienceNote): ExperienceNote[] {
  const hit = list.find(
    (n) => n.text === note.text && n.taskId === note.taskId && n.scope === note.scope,
  );
  if (hit) {
    hit.hits = (hit.hits || 1) + 1;
    return list;
  }
  return [...list, note];
}

export function recordTaskOutcome(
  root: AgentMemoryRoot,
  projectKey: string,
  taskId: string,
  ok: boolean,
  styleName?: string,
): void {
  const project = root.projects[projectKey];
  if (!project) return;
  const prev: TaskStat = project.taskStats[taskId] || { success: 0, fail: 0 };
  const next: TaskStat = {
    success: prev.success + (ok ? 1 : 0),
    fail: prev.fail + (ok ? 0 : 1),
    lastAt: nowIso(),
    ...(styleName || prev.lastStyleName
      ? { lastStyleName: styleName || prev.lastStyleName }
      : {}),
  };
  project.taskStats[taskId] = next;
  if (ok && styleName) {
    project.preferredTableStyle = styleName;
  }
  project.updatedAt = nowIso();
  saveMemory(root);
}

export function appendProjectDigest(
  root: AgentMemoryRoot,
  projectKey: string,
  digest: string,
): void {
  const project = root.projects[projectKey];
  if (!project || !digest.trim()) return;
  project.digests = [...project.digests, digest.trim()].slice(-30);
  project.updatedAt = nowIso();
  saveMemory(root);
}

/** Slice of memory relevant to the active project for the prompt. */
export function memorySliceForPrompt(
  root: AgentMemoryRoot,
  projectKey: string | null,
): {
  agentLessons: string[];
  userLessons: string[];
  projectLessons: string[];
  projectPreferredTableStyle?: string;
  taskStats: Record<string, TaskStat>;
  recentDigests: string[];
  projectName?: string;
} {
  const project = projectKey ? root.projects[projectKey] : undefined;
  return {
    agentLessons: root.agentLessons.slice(-12).map((n) => n.text),
    userLessons: root.user.lessons.slice(-12).map((n) => n.text),
    projectLessons: project?.lessons.slice(-16).map((n) => n.text) ?? [],
    ...(project?.preferredTableStyle
      ? { projectPreferredTableStyle: project.preferredTableStyle }
      : {}),
    taskStats: project?.taskStats ?? {},
    recentDigests: project?.digests.slice(-8) ?? [],
    ...(project ? { projectName: project.documentName } : {}),
  };
}
