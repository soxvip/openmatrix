/**
 * Copy command - minimal metadata only.
 * Implementation is lazy-loaded from copy.tsx to reduce startup time.
 */
import type { Command } from '../../commands.js'

const copy = {
  type: 'local-jsx',
  name: 'copy',
  description:
    'Copia a última resposta do Claude para a área de transferência (ou /copy N para a N-ésima mais recente)',
  load: () => import('./copy.js'),
} satisfies Command

export default copy
