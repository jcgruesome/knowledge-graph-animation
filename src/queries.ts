import type { SupportQuery } from './brandkit';

export type { SupportQuery };

/**
 * The built-in ReshapeX rotation, used whenever no BrandKit is loaded (`?kit=` absent).
 * Quick Consult runs in seven languages, so the inbound query rotates through them each
 * loop and each answer is written in the language of its question.
 *
 * The questions are the original pre-BrandKit demo rotation verbatim. The answers are
 * written to match what the original demo card displayed (robot / payload / application
 * resolved to a validated part), collapsed to the single answer line the card now renders.
 */
export const DEFAULT_QUERIES: SupportQuery[] = [
  {
    question: 'customer query · UR10e · 12.5 kg · palletizing',
    answer: 'QC-11 tool changer + VG10 vacuum end-effector · 15 kg rated · UR10e flange verified',
    confidence: 1,
  },
  {
    question: 'Kundenanfrage · KUKA KR 10 · 8 kg · Schweißen',
    answer: 'Werkzeugwechsler QC-7 + Schweißadapter WA-40 · 10 kg zulässig · KR 10 Flansch geprüft',
    confidence: 1,
  },
  {
    question: 'consulta · FANUC CRX-10iA · 10 kg · carga de máquinas',
    answer: 'Cambiador QC-11 + pinza paralela PG-70 · 12 kg admitidos · brida CRX-10iA verificada',
    confidence: 1,
  },
  {
    question: 'demande · ABB IRB 1300 · 7 kg · assemblage',
    answer: 'Changeur QC-7 + dispositif de compliance CD-25 · 8 kg admis · bride IRB 1300 vérifiée',
    confidence: 1,
  },
  {
    question: 'richiesta · Yaskawa GP12 · 12 kg · pallettizzazione',
    answer: 'Cambia-utensile QC-11 + ventosa VG10 · 14 kg ammessi · flangia GP12 verificata',
    confidence: 1,
  },
  {
    question: '問い合わせ · Denso VS-087 · 7 kg · ピッキング',
    answer: 'ツールチェンジャー QC-7 + 平行グリッパ PG-70 · 8 kg 対応 · VS-087 フランジ検証済み',
    confidence: 1,
  },
  {
    question: '咨询 · UR5e · 5 kg · 包装',
    answer: '快换装置 QC-7 + 真空吸盘 VG10 · 承载 6 kg · UR5e 法兰已验证',
    confidence: 1,
  },
];
