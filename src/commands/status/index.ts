import type { Command } from '../../commands.js'

const status = {
  type: 'local-jsx',
  name: 'status',
  description:
    'Mostra o status do OPEN MATRIX incluindo versão, modelo, conta, conectividade de API e status das ferramentas',
  immediate: true,
  load: () => import('./status.js'),
} satisfies Command

export default status
