import type { Command } from '../../commands.js'

const lsp = {
  type: 'local',
  name: 'lsp',
  description: 'Inspeciona e configura a inteligência de código do Language Server Protocol',
  argumentHint:
    'status | recommend [path] | install <plugin-id> | uninstall <plugin-id> | restart',
  supportsNonInteractive: false,
  load: () => import('./lsp.js'),
} satisfies Command

export default lsp
