import * as vscode from 'vscode';
import { looksLikePactContract, parsePactContract, findPactIssues, type PactContract, type PactFinding } from './pactFile';
import { recordHit } from './reviewPrompt';

const DEFAULT_GLOB = '**/pacts/**/*.json';

interface LoadedContract {
  uri: vscode.Uri;
  contract: PactContract;
  findings: PactFinding[];
}

async function loadContracts(glob: string): Promise<LoadedContract[]> {
  const uris = await vscode.workspace.findFiles(glob, '**/node_modules/**');
  const loaded: LoadedContract[] = [];
  for (const uri of uris) {
    try {
      const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
      const json = JSON.parse(text);
      if (!looksLikePactContract(json)) continue;
      const contract = parsePactContract(json);
      loaded.push({ uri, contract, findings: findPactIssues(contract) });
    } catch {
      // not valid JSON, or not really a Pact contract despite matching the glob -- skip it silently
    }
  }
  return loaded;
}

type Node = LoadedContract | { parent: LoadedContract; finding: PactFinding };

class PactTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private contracts: LoadedContract[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  async refresh(glob: string): Promise<void> {
    this.contracts = await loadContracts(glob);
    // Real findings actually surfaced in the tree -- dedup'd by file URI
    // + finding index so re-scanning on every watcher refresh doesn't
    // inflate the count towards the review prompt.
    for (const contract of this.contracts) {
      contract.findings.forEach((finding, index) => {
        recordHit(this.context, `${contract.uri.toString()}:${index}:${finding.kind}:${finding.description}`);
      });
    }
    this.onDidChangeTreeDataEmitter.fire();
  }

  get loaded(): LoadedContract[] {
    return this.contracts;
  }

  getTreeItem(element: Node): vscode.TreeItem {
    if ('finding' in element) {
      const label =
        element.finding.kind === 'missing-provider-state'
          ? `⚠ No provider state: "${element.finding.description}"`
          : `⚠ Duplicate interaction (×${element.finding.count}): "${element.finding.description}" [${element.finding.providerState}]`;
      return new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    }
    const item = new vscode.TreeItem(
      `${element.contract.consumerName} → ${element.contract.providerName}`,
      element.findings.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
    item.description = `${element.contract.interactions.length} interaction(s), ${element.findings.length} finding(s)`;
    item.resourceUri = element.uri;
    item.command = { command: 'vscode.open', title: 'Open', arguments: [element.uri] };
    return item;
  }

  getChildren(element?: Node): Node[] {
    if (!element) return this.contracts;
    if ('finding' in element) return [];
    return element.findings.map((finding) => ({ parent: element, finding }));
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('pactContractCompanion');
  const glob = config.get<string>('contractGlob', DEFAULT_GLOB);

  const provider = new PactTreeProvider(context);
  const treeView = vscode.window.createTreeView('pactContractCompanion.contracts', { treeDataProvider: provider });
  context.subscriptions.push(treeView);

  const refresh = () => void provider.refresh(glob);
  refresh();

  const watcher = vscode.workspace.createFileSystemWatcher(glob);
  context.subscriptions.push(watcher);
  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);

  context.subscriptions.push(vscode.commands.registerCommand('pactContractCompanion.refresh', refresh));
}

export function deactivate(): void {
  // no-op: no timers, connections, or watchers outside context.subscriptions to tear down
}
