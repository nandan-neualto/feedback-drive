import type { FeedbackItem } from '../model';

/** Explicitly labelled examples, never presented as collected visitor reviews. */
export const experienceSamples: FeedbackItem[] = [
  {
    id: 'ec50f81e-a37a-4a23-87e5-4ea35bd709d6', name: 'A.', avatar: 'wave', category: 'Exhibits',
    title: 'Learning comes to life',
    message: 'The exhibits made Toyota’s story and approach to innovation easy to understand. A few more short labels beside the displays would help visitors explore at their own pace.',
    suggestion: 'Add a short, easy-to-read summary beside each exhibit.', rating: 5,
    visitType: 'School / college visit', visitZone: 'Exhibits', status: 'new',
  },
  {
    id: '815b1b20-728c-4daf-9bfc-6def161abbd3', name: 'A.', avatar: 'smile', category: 'Guided tours',
    title: 'A guide who welcomed every question',
    message: 'Our guide connected the displays to everyday experiences and made time for everyone’s questions. A little more time at the final stop would make the tour even better.',
    rating: 5, visitType: 'Individual visit', visitZone: 'Guided tour', status: 'reviewed',
    teamReply: 'Thank you for the thoughtful feedback. We are reviewing the time allocated to each tour stop so there is more room for questions.',
    teamReplyAt: '2026-10-08T11:30:00.000Z',
  },
  {
    id: '5abbce78-c5e9-458f-8fd0-caa070a64768', name: 'R.', avatar: 'heart', category: 'Interactive activities',
    title: 'The hands-on activities were a family favourite',
    message: 'The interactive activities were the highlight for our children. A simple queue or turn indicator would help families know when it is their turn during busy sessions.',
    suggestion: 'Show a clear waiting point and the next available turn.', rating: 4,
    visitType: 'Family visit', visitZone: 'Interactive area', status: 'shortlisted',
    teamReply: 'We appreciate your suggestion. A clearer way to organise turns is included in our improvement plan for busy visiting periods.',
    teamReplyAt: '2026-10-08T11:15:00.000Z',
  },
  {
    id: 'af47f269-9e8f-4740-b1e5-fed0004c5946', name: 'K.', avatar: 'spark', category: 'Visitor support',
    title: 'A warm welcome from the centre team',
    message: 'The welcome team helped our group get oriented, explained what we could explore, and made the visit feel relaxed from the start. Thank you for being so approachable.',
    rating: 5, visitType: 'Group visit', visitZone: 'Reception', status: 'reviewed',
    teamReply: 'Thank you. We are glad the welcome helped your group feel at home. We will share your appreciation with the visitor support team.',
    teamReplyAt: '2026-10-08T11:00:00.000Z',
  },
  {
    id: '195417b5-0fbe-4e8c-9e62-375e3d7345db', name: 'M.', avatar: 'sun', category: 'Facilities & accessibility',
    title: 'More places to pause during the visit',
    message: 'We enjoyed exploring together, but an older member of our family needed more opportunities to sit down. Clearer signs to visitor facilities would also help first-time visitors.',
    suggestion: 'Add resting points and easy-to-follow signs between areas.', rating: 3,
    visitType: 'Family visit', visitZone: 'Visitor facilities', status: 'new',
  },
  {
    id: '8fc937c8-b66c-4f82-b40e-5f1849a780a4', name: 'A.', avatar: 'leaf', category: 'Overall visit',
    title: 'A memorable visit for the whole family',
    message: 'We left the Toyota Experience Centre with plenty to talk about. The mix of stories, exhibits, and activities gave each of us something to enjoy and discover.',
    suggestion: 'Offer a simple take-home recap of the visit.', rating: 5,
    visitType: 'Family visit', visitZone: 'General visit', status: 'adopted',
    teamReply: 'Thank you for helping us improve. This example shows how a completed suggestion and a response from the centre team will appear on the board.',
    teamReplyAt: '2026-10-08T10:30:00.000Z',
  },
].map((sample, index) => ({
  photos: [], consent: true, published: true, kioskId: 'LOCAL-UI-QA',
  area: 'Toyota Experience Centre', createdAt: `2026-10-08T${String(10 - index).padStart(2, '0')}:00:00.000Z`,
  isDemo: true, ...sample,
}));
