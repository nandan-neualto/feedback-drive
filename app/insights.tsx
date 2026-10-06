'use client';

import { useMemo, useState } from 'react';
import { BarChart3, Camera, ContactRound, MapPin, MessageSquare, Star } from 'lucide-react';
import { categories, colors, type Question, type ResponseItem, type Survey } from './model';
import { Empty } from './ui';
import { usePreferences } from './i18n';

type Props = { surveys: Survey[]; responses: ResponseItem[]; onCategory: (category: string) => void };
type Summary = { question: Question; earlier: boolean; answered: number; counts: Map<string, number>; totalRating: number };
const summaryKey = (question: Question) => JSON.stringify([question.id, question.type, question.label, question.options || []]);
const supported = (question: Question) => ['rating', 'single', 'multiple', 'yesno'].includes(question.type);

function summarize(survey: Survey, responses: ResponseItem[]) {
  const summaries = new Map<string, Summary>();
  function get(question: Question): Summary {
    const key = summaryKey(question);
    let summary = summaries.get(key);
    if (!summary) {
      const labels = question.type === 'rating' ? ['1', '2', '3', '4', '5'] : question.type === 'yesno' ? ['yes', 'no'] : question.options || [];
      summary = { question, earlier: !survey.questions.some(q => summaryKey(q) === key), answered: 0, counts: new Map(labels.map(label => [label, 0])), totalRating: 0 };
      summaries.set(key, summary);
    }
    return summary;
  }
  survey.questions.filter(supported).forEach(get);
  responses.forEach(response => {
    (response.questions || survey.questions).filter(supported).forEach(question => {
      const value = response.answers[question.id];
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) return;
      const summary = get(question);
      if (question.type === 'rating') {
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) return;
        summary.answered++; summary.totalRating += value;
        summary.counts.set(String(value), (summary.counts.get(String(value)) || 0) + 1);
      } else {
        const choices = question.type === 'multiple' ? Array.isArray(value) ? [...new Set(value)] : [] : typeof value === 'string' ? [question.type === 'yesno' ? value.toLowerCase() : value] : [];
        const valid = choices.filter(choice => summary.counts.has(choice));
        if (!valid.length) return;
        summary.answered++;
        valid.forEach(choice => summary.counts.set(choice, (summary.counts.get(choice) || 0) + 1));
      }
    });
  });
  return [...summaries.values()];
}

export default function Insights({ surveys, responses, onCategory }: Props) {
  const { t, categoryLabel, number } = usePreferences();
  const [selectedSurvey, setSelectedSurvey] = useState('all');
  const totals = useMemo(() => {
    const photos = new Set<string>();
    responses.forEach(response => { response.photos.forEach(photo => photos.add(photo)); if (response.avatar && (/^[a-f0-9]{64}$/.test(response.avatar) || response.avatar.startsWith('/api/files/'))) photos.add(response.avatar); });
    return { photos: photos.size, contacts: responses.filter(response => response.contact?.trim()).length, kiosks: new Set(responses.map(response => response.kioskId).filter(Boolean)).size, featured: responses.filter(response => response.featured && response.status !== 'hidden').length };
  }, [responses]);
  const categoryCounts = useMemo(() => {
    const all = [...new Set([...categories, ...responses.map(response => response.category)])];
    return all.map(category => ({ category, count: responses.filter(response => response.category === category).length })).sort((a, b) => b.count - a.count);
  }, [responses]);
  const groups = useMemo(() => {
    const knownIds = new Set(surveys.map(survey => survey.id));
    const archived: Survey[] = [];
    for (const response of responses) if (!knownIds.has(response.surveyId)) {
      knownIds.add(response.surveyId);
      archived.push({ id: response.surveyId, title: response.surveyTitle || '', description: '', category: response.category, status: 'closed', questions: response.questions || [], responseCount: 0, allowPhotos: true, requireName: false, showOnBoard: false });
    }
    return [...surveys, ...archived].filter(survey => selectedSurvey === 'all' || selectedSurvey === survey.id).map(survey => {
      const items = responses.filter(response => response.surveyId === survey.id);
      return { survey, responses: items, summaries: summarize(survey, items), archived: !surveys.some(current => current.id === survey.id) };
    }).filter(group => group.responses.length || selectedSurvey !== 'all');
  }, [surveys, responses, selectedSurvey]);

  return <div className="insights-view">
    <div className="stats-grid">
      <div className="stat-card"><div className="stat-label">{t("Photos shared")}<Camera /></div><div className="stat-value">{number(totals.photos)}</div><div className="stat-foot">{t("Attachments and selfies")}</div></div>
      <div className="stat-card"><div className="stat-label">{t("Contact details")}<ContactRound /></div><div className="stat-value">{number(totals.contacts)}</div><div className="stat-foot">{t("People open to a follow-up")}</div></div>
      <div className="stat-card"><div className="stat-label">{t("Active kiosks")}<MapPin /></div><div className="stat-value">{number(totals.kiosks)}</div><div className="stat-foot">{t("Locations collecting responses")}</div></div>
      <div className="stat-card"><div className="stat-label">{t("Featured responses")}<Star /></div><div className="stat-value">{number(totals.featured)}</div><div className="stat-foot">{t("Selected for the public board")}</div></div>
    </div>
    <div className="panel category-panel"><div className="panel-header"><div><span className="eyebrow">{t("Where feedback lands")}</span><h3>{t("Responses by category")}</h3></div><span className="badge gray">{t(responses.length === 1 ? '{count} response' : '{count} responses', { count: number(responses.length) })}</span></div><div className="chart-list" role="list" aria-label={t("Response counts by category")}>{categoryCounts.map(({ category, count }) => <button key={category} role="listitem" className="chart-row category-chart-row" title={t('View {count} {category} responses', { count: number(count), category: categoryLabel(category) })} onClick={() => onCategory(category)}><span className="chart-label"><i style={{ background: colors[category] || '#959eae' }} />{categoryLabel(category)}</span><span className="chart-track"><span className="chart-bar" style={{ display: 'block', width: `${responses.length ? count / responses.length * 100 : 0}%`, background: colors[category] || '#959eae' }} /></span><span className="chart-value">{number(count)}</span></button>)}</div><p className="help-text chart-caption">{t("Select a category to explore its responses.")}</p></div>
    <div className="toolbar insights-toolbar"><div><span className="eyebrow">{t("Listen closer")}</span><h2>{t("Question insights")}</h2></div><label className="form-field"><span className="sr-only">{t("Filter insights by survey")}</span><select className="select-input" value={selectedSurvey} onChange={e => setSelectedSurvey(e.target.value)}><option value="all">{t("All surveys")}</option>{surveys.map(survey => <option key={survey.id} value={survey.id}>{survey.title}</option>)}</select></label></div>
    {!groups.length ? <Empty icon={BarChart3} title={t("Insights start with a response")} text={t("Publish a survey and invite people to share their experience. Rating and choice results will appear here.")} /> : <div className="stack survey-insights">{groups.map(group => <section className="panel" key={group.survey.id}><div className="panel-header"><div><span className="eyebrow">{categoryLabel(group.survey.category)}{group.archived ? ` · ${t('Archived survey')}` : ''}</span><h3>{group.survey.title || t('Archived survey')}</h3></div><span className="badge gray">{t(group.responses.length === 1 ? '{count} response' : '{count} responses', { count: number(group.responses.length) })}</span></div>{!group.summaries.length ? <div className="panel-body insights-empty"><MessageSquare /><p>{t("This survey uses written answers. Open its responses to read what people shared.")}</p></div> : <div className="insight-question-grid">{group.summaries.map(summary => <div className="insight-question" key={summaryKey(summary.question)}><div className="row between"><span className="detail-label">{t(summary.question.type === 'rating' ? 'Rating' : summary.question.type === 'multiple' ? 'Multiple choice' : summary.question.type === 'yesno' ? 'Yes / No' : 'Single choice')}</span>{summary.earlier && <span className="badge gray">{t("Earlier question")}</span>}</div><h4>{summary.question.label}</h4>{summary.question.type === 'rating' && <div className="rating-summary"><strong>{summary.answered ? number(summary.totalRating / summary.answered, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}</strong><span>{t("/ 5 average")}</span><div aria-hidden="true">{[1, 2, 3, 4, 5].map(value => <Star key={value} size={13} style={{ fill: summary.answered && summary.totalRating / summary.answered >= value ? '#e9b866' : 'none', color: '#e9b866' }} />)}</div></div>}<div className="chart-list question-chart-list" role="list" aria-label={t('Results for {question}', { question: summary.question.label })}>{Array.from(summary.counts.entries()).map(([choice, count]) => <div className="chart-row" role="listitem" key={choice}><span className="chart-label">{summary.question.type === 'rating' ? t(choice === '1' ? '{count} star' : '{count} stars', { count: number(Number(choice)) }) : summary.question.type === 'yesno' ? t(choice === 'yes' ? 'Yes' : 'No') : choice}</span><span className="chart-track"><span className="chart-bar" style={{ display: 'block', width: `${summary.answered ? count / summary.answered * 100 : 0}%` }} /></span><span className="chart-value" title={t(count === 1 ? '{count} response' : '{count} responses', { count: number(count) })}>{number(summary.answered ? Math.round(count / summary.answered * 100) : 0)}%<small>{number(count)}</small></span></div>)}</div><p className="help-text">{t(summary.answered === 1 ? '{count} answer' : '{count} answers', { count: number(summary.answered) })}{summary.question.type === 'multiple' ? ` · ${t('People could select more than one choice.')}` : ''}</p></div>)}</div>}</section>)}</div>}
  </div>;
}
