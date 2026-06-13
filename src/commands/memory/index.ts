import type { Command } from '../../commands.js'

const memory: Command = {
  type: 'local-jsx',
  name: 'memory',
  description: 'Edita os arquivos de memória do Claude',
  load: () => import('./memory.js'),
}

export default memory
