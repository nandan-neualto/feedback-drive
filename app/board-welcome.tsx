'use client';

import { ArrowUpRight, BadgeCheck, Lightbulb, ShieldCheck, Wrench } from 'lucide-react';
import { usePreferences } from './i18n';

const prompts = [
  { category: 'Safety', icon: ShieldCheck, title: 'A safer journey', text: 'A detail that would help you feel more confident.' },
  { category: 'Quality', icon: BadgeCheck, title: 'A better detail', text: 'Something you loved, or something worth improving.' },
  { category: 'Service', icon: Wrench, title: 'A smoother visit', text: 'A small change to make the experience easier.' },
];

export default function BoardWelcome({ onStart }: { onStart: (category: string) => void }) {
  const { t } = usePreferences();
  return <div className="board-welcome">
    <div className="welcome-intro"><span className="welcome-icon"><Lightbulb size={24} strokeWidth={1.5} /></span><div><span className="welcome-kicker">{t("Real feedbacks. Real progress.")}</span><h2>{t("Your experience helps us improve.")}</h2><p>{t('Be the first to share. A few words or a photo can make a difference.')}</p></div></div>
    <div className="welcome-prompts">{prompts.map(prompt => <button key={prompt.category} onClick={() => onStart(prompt.category)}><span className="prompt-icon"><prompt.icon size={20} strokeWidth={1.6} /></span><strong>{t(prompt.title)}</strong><span>{t(prompt.text)}</span><ArrowUpRight className="prompt-arrow" size={18} /></button>)}</div>
  </div>;
}
