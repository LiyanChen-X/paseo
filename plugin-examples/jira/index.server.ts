import type { PluginServerContext } from "@getpaseo/plugin/server";
import { createIssueHandlers } from "./server/issues";
import { getIssueRpc, searchIssuesRpc, testConnectionRpc } from "./shared/issues";
import { connection } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const settings = server.registerSettings(connection);
  const handlers = createIssueHandlers(settings);
  server.handle(searchIssuesRpc, handlers.search);
  server.handle(getIssueRpc, handlers.get);
  server.handle(testConnectionRpc, handlers.testConnection);
  return () => {};
}
