'use client';
import { Check, Circle } from 'lucide-react';
import { usePreferences } from './i18n';

const stages = ['new', 'reviewed', 'shortlisted', 'adopted'];
const descriptions: Record<string, string> = {
  new: 'Received by the team and waiting for review.',
  reviewed: 'The team is reviewing this experience.',
  shortlisted: 'The team has planned a follow-up action.',
  adopted: 'The team has marked this feedback as completed.',
};

export default function FeedbackProgress({ status }: { status: string }) {
  const { t, statusLabel } = usePreferences();
  const current = stages.indexOf(status);
  if (current < 0) return null;
  return <section className="feedback-progress" aria-label={t('Feedback progress')}>
    <div className="feedback-progress-heading"><strong>{t('Feedback progress')}</strong><span>{statusLabel(status)}</span></div>
    <ol>{stages.map((stage, index) => <li key={stage} className={index <= current ? 'reached' : ''} aria-current={index === current ? 'step' : undefined}><span className="progress-node" aria-hidden="true">{index < current ? <Check size={13} /> : <Circle size={9} fill={index === current ? 'currentColor' : 'none'} />}</span><span>{statusLabel(stage)}</span></li>)}</ol>
    <p>{t(descriptions[status])}</p>
  </section>;
}
