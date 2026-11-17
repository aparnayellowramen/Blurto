// The 6 speaking frameworks (FR-5, FR-9), chosen for explaining a concept.

export const FRAMEWORKS = [
  { id: 'wsn', name: 'What / So What / Now What', steps: ['What it is', 'Why it matters', 'What to do with it'], bestFor: 'Any topic. The default' },
  { id: 'prep', name: 'PREP', steps: ['Point', 'Reason', 'Example', 'Point'], bestFor: 'Topics where you can take a position' },
  { id: 'ppf', name: 'Past / Present / Future', steps: ['Origin', 'Today', "What's next"], bestFor: 'History, technology, trends' },
  { id: 'scqa', name: 'SCQA', steps: ['Situation', 'Complication', 'Question', 'Answer'], bestFor: 'Puzzles, paradoxes, science' },
  { id: 'feynman', name: 'Feynman: explain simply', steps: ['Plain definition', 'Analogy', 'Example', 'Recap'], bestFor: 'Complex or abstract topics' },
  { id: 'psb', name: 'Problem / Solution / Benefit', steps: ['Problem', 'Solution', 'Benefit'], bestFor: 'Business, tech, policy' },
];

export const DEFAULT_FRAMEWORK = 'wsn';

export const getFramework = (id) => FRAMEWORKS.find((f) => f.id === id) ?? FRAMEWORKS[0];
