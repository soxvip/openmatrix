import type { Command } from '../../commands.js'

const atualizar: Command = {
  name: 'atualizar',
  description:
    'Atualiza o CLI e a extensão para a versão mais recente do GitHub',
  type: 'local',
  supportsNonInteractive: true,
  load: () => import('./atualizar.js'),
}

export default atualizar
