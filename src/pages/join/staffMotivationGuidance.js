// Copy for the Staff motivation form. Every team answers the same question;
// the department only changes the small "ideas" hint, the example placeholder
// and the first link placeholder. Keys match the Join staff_department values.

export const STAFF_MOTIVATION_QUESTION = 'What attracts you to this team, and what would you like to bring to it?'

export const STAFF_MOTIVATION_GUIDANCE = Object.freeze({
  'dev-tech': Object.freeze({
    ideas: 'websites or apps you have built, GitHub repositories, demos, technical projects, hackathons, what you enjoy about programming, or the technologies you are learning right now.',
    example: 'Example: I have been learning web development and building small React projects. I would like to join Dev / Tech to work on real collaborative projects, improve my development workflow and contribute what I already know.',
    linkPlaceholder: 'https://github.com/your-name',
  }),
  'design-content': Object.freeze({
    ideas: 'graphic design, branding, social media content, photography or video, motion design, your Behance, Instagram or YouTube, Figma work, or campaigns you made for a club.',
    example: 'Example: I have been creating visual content for my university club for two years. I would like to join the Content Creation team to learn how a team plans and delivers a complete campaign. I can contribute visual ideas and I am comfortable working with deadlines.',
    linkPlaceholder: 'https://www.behance.net/your-name',
  }),
  'management-logistics': Object.freeze({
    ideas: 'events you helped organise, times you coordinated a team, communication, logistics and planning, sponsorship or outreach, documentation, or responsibilities you have taken on.',
    example: 'Example: I enjoy organising activities and coordinating with people. I would like to contribute to event preparation, communication and team organisation while learning how larger club projects are managed.',
    linkPlaceholder: 'https://',
  }),
})

const GENERAL_GUIDANCE = Object.freeze({
  ideas: 'projects you have worked on, activities you helped with, skills you are building, or what you would like to learn with the team.',
  example: 'Write in your own words…',
  linkPlaceholder: 'https://',
})

export const staffMotivationGuidance = (departmentKey) => STAFF_MOTIVATION_GUIDANCE[departmentKey] || GENERAL_GUIDANCE
