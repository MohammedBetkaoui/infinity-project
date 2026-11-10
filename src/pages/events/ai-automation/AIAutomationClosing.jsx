import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import InfinityClubMark from '../../../components/InfinityClubMark'
import { aiAutomationPhotos } from './aiAutomationMedia'
import WorkshopPhoto from './WorkshopPhoto'

export default function AIAutomationClosing() {
  return <section className="ai-closing ai-section" aria-labelledby="ai-closing-title"><div className="ai-shell">
    <div className="ai-closing-layout"><figure className="ai-closing-photo"><WorkshopPhoto photo={aiAutomationPhotos.conversation} sizes="(max-width: 767px) 70vw, 30vw" /><figcaption className="ai-mono">One frame. More possibilities.</figcaption></figure><div className="ai-closing-copy"><InfinityClubMark className="ai-closing-mark" /><p className="ai-mono">Keep the connection</p><h2 id="ai-closing-title" data-ai-heading>The workshop ends.<br /><em>The learning<br />continues.</em></h2><p>One workshop is only the beginning. More ideas, more experiments, and more opportunities to build together.</p><div className="ai-closing-links"><Link className="ai-link" to="/events">Explore more events <ArrowUpRight size={18} aria-hidden="true" /></Link><Link className="ai-link" to="/community">Meet the community <ArrowUpRight size={18} aria-hidden="true" /></Link></div></div></div>
    <p className="ai-signature ai-mono">Infinity Club — No limits for Infiniters</p>
  </div></section>
}
