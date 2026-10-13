'use client';

import { ArrowUpRight, BadgeCheck, Lightbulb, ShieldCheck, Wrench } from 'lucide-react';
import { usePreferences } from './i18n';

const prompts = [
  { category: 'Exhibits', icon: BadgeCheck, title: 'Explore the exhibits', text: 'Tell us what you discovered, enjoyed, or found unclear.' },
  { category: 'Guided tours', icon: Lightbulb, title: 'Your guided tour', text: 'Help us make explanations, pacing, and group visits better.' },
  { category: 'Facilities & accessibility', icon: ShieldCheck, title: 'A more welcoming centre', text: 'Share feedbacks about our team, facilities, and accessibility.' },
];

export default function BoardWelcome({ onStart }: { onStart: (category: string) => void }) {
  const { t } = usePreferences();
  return <div className="board-welcome">
    <div className="welcome-intro"><span className="welcome-icon"><Lightbulb size={24} strokeWidth={1.5} /></span><div><span className="welcome-kicker">{t("Toyota Experience Centre")}</span><h2>{t("Every visit helps us improve.")}</h2><p>{t('Share a highlight, a concern, or a photo from your visit.')}</p></div></div>
    <div className="welcome-prompts">{prompts.map(prompt => <button key={prompt.category} onClick={() => onStart(prompt.category)}><span className="prompt-icon"><prompt.icon size={20} strokeWidth={1.6} /></span><strong>{t(prompt.title)}</strong><span>{t(prompt.text)}</span><ArrowUpRight className="prompt-arrow" size={18} /></button>)}</div>
  </div>;
}
