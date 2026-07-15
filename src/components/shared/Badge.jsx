import './Badge.css'

export default function Badge({ children, variant = 'default', icon, className = '' }) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {icon && <span className="badge-icon">{icon}</span>}
      {children}
    </span>
  )
}
