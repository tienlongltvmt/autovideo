import './Card.css'

export default function Card({
  children,
  title,
  subtitle,
  footer,
  size = 'md',
  className = '',
  ...props
}) {
  return (
    <div className={`card card-${size} ${className}`} {...props}>
      {(title || subtitle) && (
        <div className="card-header">
          {title && <h3 className="card-title">{title}</h3>}
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
      )}

      <div className="card-content">
        {children}
      </div>

      {footer && (
        <div className="card-footer">
          {footer}
        </div>
      )}
    </div>
  )
}
