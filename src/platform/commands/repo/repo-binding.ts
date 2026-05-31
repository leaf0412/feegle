import type { RepositoryRecord } from "../../../domain/models.js";
import type { ChatBinding, ChatBindingStore } from "../../../resources/repositories/chat-binding-store.js";
import type { RepositoryStore } from "../../../resources/repositories/repository-store.js";
import { deriveRepositoryName } from "./repo-url.js";

export interface RepoBindingStores {
  repositoryStore: RepositoryStore;
  chatBindingStore: ChatBindingStore;
}

export interface RepoBindResult {
  record: RepositoryRecord;
  binding: ChatBinding;
}

/**
 * Bind a git url to a scope (group chat id or `user:<id>`), registering the
 * repo first if the url is unknown. No network probing — an unknown url is
 * registered with a placeholder `defaultBaseBranch`. Shared by the /bind_repo
 * slash command and the unbound-repo prompt card so the two never drift.
 */
export async function bindRepositoryToScope(
  stores: RepoBindingStores,
  scopeKey: string,
  url: string
): Promise<RepoBindResult> {
  const record =
    stores.repositoryStore.findByUrl(url) ??
    (await stores.repositoryStore.add({
      name: deriveRepositoryName(url),
      remoteUrl: url,
      defaultBaseBranch: "main"
    }));
  const binding = await stores.chatBindingStore.addRepository(scopeKey, record.id);
  return { record, binding };
}

/** Indented "name (id)" list of a binding's repos; flags ids whose record was deleted. */
export function formatBoundRepoLines(
  repositoryStore: RepositoryStore,
  binding: Pick<ChatBinding, "repositoryIds">
): string {
  return binding.repositoryIds
    .map((id) => {
      const repo = repositoryStore.get(id);
      return `    - ${repo ? `${repo.name} (${id})` : `${id} (已删除)`}`;
    })
    .join("\n");
}
