import { Children, isValidElement, useRef } from 'react'
import useScrollAnimations from '../hooks/useScrollAnimations'

const textKey = (children) => Children.toArray(children).map((child) =>
  isValidElement(child) ? child.type === 'br' ? '\n' : textKey(child.props.children) : String(child),
).join('')

function TextScene({ tag: Tag = 'h2', children, split = 'words', start, end, className = '', ...props }) {
  const ref = useRef(null)
  useScrollAnimations(ref, ({ revealText }) => {
    revealText(ref, { type: split, start, end })
  }, { rebuildKey: `${split}:${start}:${end}` })
  return <Tag ref={ref} className={className} data-animated-text {...props}>{children}</Tag>
}

export default function AnimatedText(props) {
  // A changed message gets a fresh DOM subtree; SplitText never competes with React's text reconciliation.
  return <TextScene key={textKey(props.children)} {...props} />
}
