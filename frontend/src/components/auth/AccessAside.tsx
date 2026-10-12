import { BadgeCheck, Clock, FlaskConical, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { BrandMark } from '../ui/BrandMark'

const copy = {
  register: { title: 'Start with a demo balance.', text: 'Create your account, explore the terminal and learn how trades settle before you ever use real funds.' },
  login: { title: 'Welcome back to the terminal.', text: 'Your positions, wallet and history are waiting where you left them.' },
  other: { title: 'Your account, protected.', text: 'We take account security seriously so you can focus on the markets.' },
} as const

export function AccessAside({ variant }: { variant: keyof typeof copy }) {
  const { title, text } = copy[variant]
  return (
    <aside className="access-aside">
      <Link to="/" className="access-aside__logo"><BrandMark /><span>SL Spot</span></Link>
      <div className="access-aside__body">
        <h2>{title}</h2>
        <p>{text}</p>
        <ul>
          <li><FlaskConical size={16} /> Practice with a demo balance</li>
          <li><Clock size={16} /> Crypto markets open 24/7</li>
          <li><ShieldCheck size={16} /> Two-factor authentication</li>
          <li><BadgeCheck size={16} /> Identity-verified withdrawals</li>
        </ul>
      </div>
      <small>Trading involves risk. You can lose the money you stake.</small>
    </aside>
  )
}
