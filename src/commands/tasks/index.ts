import type { Command } from '../../commands.js'

const tasks = {
  type: 'local-jsx',
  name: 'tasks',
  aliases: ['bashes'],
  description: 'Lista e gerencia tarefas em segundo plano',
  load: () => import('./tasks.js'),
} satisfies Command

export default tasks
