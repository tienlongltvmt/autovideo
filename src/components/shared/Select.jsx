import './Select.css'

export default function Select({
  label,
  value,
  onChange,
  options = [],
  disabled = false,
  className = '',
  placeholder = '-- Chọn --',
  ...props
}) {
  return (
    <div className={`select-group ${className}`}>
      {label && <label className="select-label">{label}</label>}
      <select
        className="select-input"
        value={value}
        onChange={onChange}
        disabled={disabled}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
