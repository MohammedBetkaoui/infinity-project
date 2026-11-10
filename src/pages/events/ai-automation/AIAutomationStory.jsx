import AutomationFlow from './AutomationFlow'

export default function AIAutomationStory() {
  return (
    <section id="ai-story" className="ai-story ai-section" aria-labelledby="ai-story-title">
      <div className="ai-shell">
        <div className="ai-section-rail ai-mono"><span>02 / Connect the dots</span><span>From a question to a process</span></div>
        <div className="ai-story-heading">
          <h2 id="ai-story-title" data-ai-heading>From ideas<br />to <em>automation.</em></h2>
          <div className="ai-story-copy">
            <p>A prompt is a starting point. A workflow connects what comes next.</p>
            <p>On the projector: a question, a vector search, an answer — and a conversation about the instructions, tools and memory around a model. Here is that idea, running.</p>
          </div>
        </div>
        <AutomationFlow />
      </div>
    </section>
  )
}
