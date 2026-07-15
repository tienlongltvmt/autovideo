import './Input.css'

export default function Input({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  disabled = false,
  error,
  className = '',
  ...props
}) {
  return (
    <div className={`input-group ${className}`}>
      {label && <label className="input-label">{label}</label>}
      <input
        type={type}
        className={`input-field ${error ? 'error' : ''}`}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        {...props}
      />
      {error && <span className="input-error">{error}</span>}
    </div>
  )
}
