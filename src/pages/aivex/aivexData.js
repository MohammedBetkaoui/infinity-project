export const INSTAGRAM_URL = 'https://www.instagram.com/club_.infinity/'

// These are editorial principles, not a published competition schedule or rules.
export const approach = [
  {
    id: 'question', label: 'A question', title: 'Start with the real world.',
    text: 'A problem you understand, a need you have noticed. Before choosing a model, take the time to ask the right question.',
    code: ['const question = observe(reality)', 'const idea = imagine(question)'],
    caption: 'An idea starts with a need.',
  },
  {
    id: 'prototype', label: 'Some code', title: 'Give the idea a shape.',
    text: 'Connect logic, data and an interface. Test, get it wrong, adjust: this is where an intuition becomes an application.',
    code: ['const prototype = build(idea)', 'test(prototype, realUseCases)'],
    caption: 'Code turns an intuition into something tangible.',
  },
  {
    id: 'application', label: 'An application', title: 'Show what it changes.',
    text: 'An application makes sense through what it helps people do. Make its usefulness visible, explain your choices and acknowledge its limits.',
    code: ['const application = refine(prototype)', 'share(application, itsLimits)'],
    caption: 'Real use gives technology its purpose.',
  },
]

export const practicalDetails = [
  { label: 'Format', value: 'National competition', detail: 'Artificial intelligence application programming' },
  { label: 'Edition', value: 'Second edition', detail: 'AIVEX, by Infinity Club' },
  { label: 'Dates and venue', value: 'To be confirmed', pending: true, detail: 'The club will announce the schedule and exact venue.' },
  { label: 'Registration', value: 'Application desk available', detail: 'Submit the registration form; the organisers will confirm eligibility and participation.' },
  { label: 'Programme and rules', value: 'To be announced', pending: true, detail: 'The organisers will publish the stages, technical constraints and official criteria.' },
]

export const projectDirections = [
  {
    id: 'documents', title: 'Let documents tell their story.',
    description: 'Find information in a collection of texts, make it understandable and let people trace it back to its source.',
    question: 'How can you help someone find the right information without losing the context?',
    angle: 'Language and information retrieval',
  },
  {
    id: 'vision', title: 'Make sense of images.',
    description: 'Organise a visual collection or identify something in an image. A chance to explore the link between perception and practical use.',
    question: 'What needs to be recognised, and when does the system get it wrong?',
    angle: 'Computer vision',
  },
  {
    id: 'data', title: 'Make data understandable.',
    description: 'Explore a dataset, uncover patterns and explain them in an interface that needs no instruction manual.',
    question: 'Which piece of information genuinely changes what the user understands?',
    angle: 'Analysis and visualisation',
  },
]

export const preparationItems = [
  {
    id: 'problem-understanding',
    title: 'Problem Understanding & Domain Analysis',
    detail: 'Understand the challenge, study its context and identify exactly what the AI system is expected to solve.',
  },
  {
    id: 'data-preparation',
    title: 'Data Preparation & Engineering',
    detail: 'Explore, clean, organise and transform the available data into a reliable dataset for training and evaluation.',
  },
  {
    id: 'ai-model-development',
    title: 'AI & Model Development',
    detail: 'Select an appropriate AI approach, design the model or pipeline and make technical choices suited to the problem.',
  },
  {
    id: 'training-experimentation',
    title: 'Training & Experimentation',
    detail: 'Train, tune and compare different approaches, analyse the results and improve the solution through experimentation.',
  },
  {
    id: 'evaluation-teamwork-presentation',
    title: 'Evaluation, Teamwork & Presentation',
    detail: 'Measure performance, identify limitations, work efficiently as a team and clearly explain your methodology, results and technical choices to the jury.',
  },
]

export const aivexFaqs = [
  {
    id: 'format', question: 'Is AIVEX a conference or a competition?',
    answer: 'AIVEX is a national artificial intelligence application programming competition. This page presents its second edition. The organisers will announce the detailed programme and any additional activities.',
  },
  {
    id: 'eligibility', question: 'Who can participate? Individually or as a team?',
    answer: 'Eligibility requirements, participation format and any team size limits are still to be announced. The national scope of the competition does not replace these requirements: read the official rules when they are published.',
  },
  {
    id: 'topics', question: 'Are the example projects the required topics?',
    answer: 'No. The examples on this page are starting points for thinking about an AI use case. They are neither official categories nor a list of permitted technologies. Only the official rules will define the competition topics and constraints.',
  },
  {
    id: 'registration', question: 'How and when can I register?',
    answer: 'Use the AIVEX registration desk linked from this page. The organising team will confirm dates, eligibility and final participation through the contact details you provide.',
  },
  {
    id: 'evaluation', question: 'What about judging criteria, the jury and prizes?',
    answer: 'These details are not yet confirmed on this page. The organisers will announce the jury, evaluation criteria and any prizes. The preparation advice here is not a scoring rubric.',
  },
  {
    id: 'contact', question: 'Where can I ask the team a question?',
    answer: 'Message Infinity Club directly on Instagram at @club_.infinity. Mention AIVEX and the second edition so the team can help you more easily.',
  },
]
