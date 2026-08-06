/* eslint-disable @typescript-eslint/no-explicit-any -- This polymorphic UI facade accepts
   legacy component props while call sites are migrated to native Tailwind components. */
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type ElementType,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from "react";

type Props = Record<string, any> & {
  children?: ReactNode;
  className?: string;
  sx?: Record<string, any>;
};
type ChangeProps = Omit<Props, "onChange"> & {
  onChange?: (
    event: ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => void;
};
type ToggleProps = Omit<Props, "onChange"> & {
  onChange?: (event: ChangeEvent<HTMLInputElement>, checked: boolean) => void;
};
type SelectionProps = Omit<Props, "onChange"> & {
  onChange?: (event: SyntheticEvent, value: any) => void;
};

const spacingKeys = new Set([
  "m",
  "mt",
  "mr",
  "mb",
  "ml",
  "mx",
  "my",
  "p",
  "pt",
  "pr",
  "pb",
  "pl",
  "px",
  "py",
  "gap",
]);
const spacingMap: Record<string, string[]> = {
  m: ["margin"],
  mt: ["marginTop"],
  mr: ["marginRight"],
  mb: ["marginBottom"],
  ml: ["marginLeft"],
  mx: ["marginLeft", "marginRight"],
  my: ["marginTop", "marginBottom"],
  p: ["padding"],
  pt: ["paddingTop"],
  pr: ["paddingRight"],
  pb: ["paddingBottom"],
  pl: ["paddingLeft"],
  px: ["paddingLeft", "paddingRight"],
  py: ["paddingTop", "paddingBottom"],
  gap: ["gap"],
};
const aliases: Record<string, string> = {
  bgcolor: "backgroundColor",
  borderRadius: "borderRadius",
};

function sxStyle(sx?: Record<string, any>): CSSProperties | undefined {
  if (!sx) return undefined;
  const style: Record<string, any> = {};
  for (const [key, value] of Object.entries(sx)) {
    if (value == null || typeof value === "object") continue;
    if (spacingKeys.has(key)) {
      for (const property of spacingMap[key])
        style[property] =
          typeof value === "number" ? `${value * 0.5}rem` : value;
    } else {
      style[aliases[key] ?? key] = value;
    }
  }
  return style;
}

function mergeStyle(props: Props) {
  return { ...sxStyle(props.sx), ...props.style };
}

export function Box({
  component: Component = "div",
  sx,
  className = "",
  ...props
}: Props) {
  return (
    <Component
      className={className}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}

export function Container({
  maxWidth = "xl",
  sx,
  className = "",
  ...props
}: Props) {
  const widths: Record<string, string> = {
    sm: "max-w-2xl",
    md: "max-w-3xl",
    lg: "max-w-5xl",
    xl: "max-w-[1728px]",
  };
  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 ${widths[maxWidth] ?? "max-w-[1728px]"} ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}

export function Paper({ sx, className = "", ...props }: Props) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-[#3b3732] dark:bg-[#202020] dark:shadow-black/30 ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}

export function Typography({
  component,
  variant = "body1",
  color,
  fontWeight,
  sx,
  className = "",
  ...props
}: Props) {
  const defaults: Record<string, ElementType> = {
    h1: "h1",
    h2: "h2",
    h3: "h3",
    h4: "h4",
    h5: "h5",
    h6: "h6",
    subtitle1: "p",
    subtitle2: "p",
    body1: "p",
    body2: "p",
    overline: "p",
  };
  const Component = component ?? defaults[variant] ?? "p";
  const variants: Record<string, string> = {
    h1: "text-3xl font-light tracking-tight",
    h2: "text-2xl font-light tracking-tight",
    h3: "text-xl font-bold",
    h4: "text-lg font-normal",
    h5: "text-base font-medium",
    h6: "text-sm font-medium",
    body1: "text-[0.9375rem] leading-relaxed",
    body2: "text-[0.875rem] leading-relaxed",
    subtitle1: "text-[0.9375rem] font-medium",
    subtitle2: "text-[0.875rem] font-medium",
    overline: "text-[0.75rem] font-medium uppercase tracking-wider",
  };
  const defaultVariantColors: Record<string, string> = {
    body1: "text-gray-800 dark:text-[#f4efe8]",
    body2: "text-gray-700 dark:text-[#d8d0c7]",
    subtitle1: "text-gray-800 dark:text-[#f4efe8]",
    subtitle2: "text-gray-700 dark:text-[#d8d0c7]",
    overline: "text-gray-500 dark:text-[#c7beb4]",
  };
  const colors: Record<string, string> = {
    primary: "text-brand-primary",
    "primary.main": "text-brand-primary dark:text-[#ffb487]",
    "text.secondary": "text-text-secondary",
    "success.main": "text-emerald-700 dark:text-emerald-400",
    error: "text-red-700 dark:text-red-100",
  };
  
  const finalColor = color ? colors[color] : defaultVariantColors[variant];

  return (
    <Component
      className={`${variants[variant] ?? "text-sm"} ${finalColor ?? ""} ${className}`}
      style={{ ...sxStyle(sx), fontWeight, ...props.style }}
      {...props}
    />
  );
}

export function Button({
  component,
  variant = "contained",
  color = "primary",
  startIcon,
  endIcon,
  fullWidth,
  size = "medium",
  sx,
  className = "",
  ...props
}: Props) {
  const Component = component || (props.href ? "a" : "button");
  const base =
    "inline-flex items-center justify-center gap-2 font-medium uppercase tracking-wide rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
  const sizes = {
    small: "px-2 py-1 text-[0.8125rem]",
    medium: "px-4 py-1.5 text-[0.875rem]",
    large: "px-5 py-2 text-[0.9375rem]",
  };
  const palette =
    color === "error"
      ? "bg-red-700 hover:bg-red-800 border-red-700 text-white"
    : color === "warning"
        ? "bg-amber-600 hover:bg-amber-700 border-amber-600 text-white"
        : "bg-brand-primary/80 hover:bg-brand-primary border-brand-primary text-white dark:bg-[#d48658] dark:hover:bg-[#ff9a64] dark:border-[#ff9a64] dark:text-[#151515]";
  const look =
    variant === "contained"
      ? palette
      : variant === "outlined"
        ? "border-brand-primary text-brand-primary hover:bg-brand-primary/40 dark:border-[#ff9a64] dark:text-[#ffb487] dark:hover:bg-[#3a2a22]"
        : "border-transparent text-brand-primary hover:bg-brand-primary/40 dark:text-[#ffb487] dark:hover:bg-[#3a2a22]";
  const type = Component === "button" && !props.type && !props.href ? "button" : props.type;
  return (
    <Component
      type={type}
      className={`${base} ${sizes[size as keyof typeof sizes] || sizes.medium} ${look} ${fullWidth ? "w-full" : ""} ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    >
      {startIcon}
      {props.children}
      {endIcon}
    </Component>
  );
}

export function IconButton({
  size,
  color,
  sx,
  component: Component = "button",
  className = "",
  ...props
}: Props) {
  return (
    <Component
      type={Component === "button" ? "button" : undefined}
      className={`inline-flex size-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-[#d8d0c7] dark:hover:bg-[#2a2724] ${color === "error" ? "text-red-700 dark:text-red-400" : ""} ${size === "small" ? "size-8" : ""} ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}

export function Alert({
  severity = "info",
  sx,
  className = "",
  ...props
}: Props) {
  const styles: Record<string, string> = {
    error:
      "border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200",
    warning:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/45 dark:bg-amber-950/30 dark:text-amber-100",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100",
    info: "border-blue-300 bg-blue-50 text-blue-800 dark:border-sky-500/40 dark:bg-sky-950/30 dark:text-sky-100",
  };
  return (
    <div
      role="alert"
      className={`rounded-lg border p-3 text-sm ${styles[severity]} ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}

export function TextField({
  label,
  select,
  multiline,
  rows,
  InputProps,
  inputProps,
  sx,
  className = "",
  helperText,
  error,
  fullWidth,
  ...props
}: ChangeProps & { error?: boolean; fullWidth?: boolean }) {
  const inputBase =
    "w-full rounded-full border border-gray-300 bg-white px-4 py-2.5 text-sm [color-scheme:light] transition-colors focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary disabled:bg-gray-100 disabled:text-gray-500 dark:border-[#4a433d] dark:bg-[#181818] dark:text-[#f4efe8] dark:placeholder:text-[#8d8378] dark:[color-scheme:dark] dark:focus:border-[#ff9a64] dark:focus:ring-[#ff9a64] dark:disabled:bg-[#2a2724] dark:disabled:text-[#8d8378]";

  const textareaBase =
    "w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 font-mono text-xs transition-colors focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary dark:border-[#4a433d] dark:bg-[#181818] dark:text-[#f4efe8] dark:placeholder:text-[#8d8378] dark:focus:border-[#ff9a64] dark:focus:ring-[#ff9a64] resize-y";

  const finalInputClass = `${inputBase} ${error ? "border-rose-500 focus:border-rose-500 focus:ring-rose-500" : ""}`;

  const shared = {
    ...props,
    ...inputProps,
    readOnly: InputProps?.readOnly,
  };

  let field: ReactNode;
  if (select) {
    field = (
      <CustomSelect
        value={shared.value as string | number}
        onChange={shared.onChange as any}
        disabled={shared.disabled}
      >
        {props.children}
      </CustomSelect>
    );
  } else if (multiline) {
    field = (
      <textarea
        rows={rows ?? 6}
        style={{ minHeight: "160px" }}
        {...shared}
        className={`${textareaBase} ${className}`}
      />
    );
  } else {
    field = (
      <div className="relative">
        {InputProps?.startAdornment && (
          <span className="absolute inset-y-0 left-3.5 flex items-center text-gray-500 dark:text-[#a99f94]">
            {InputProps.startAdornment}
          </span>
        )}
        <input
          type="text"
          {...shared}
          className={`${finalInputClass} ${InputProps?.startAdornment ? "pl-10" : ""} ${InputProps?.endAdornment ? "pr-10" : ""}`}
        />
        {InputProps?.endAdornment && (
          <span className="absolute inset-y-0 right-3.5 flex items-center">
            {InputProps.endAdornment}
          </span>
        )}
      </div>
    );
  }

  return (
    <label
      className={`inline-flex flex-col text-sm font-medium text-gray-700 dark:text-[#e8dfd5] ${fullWidth ? "w-full" : ""} ${className}`}
      style={mergeStyle({ ...props, sx })}
    >
      {label && <span className="mb-1 block">{label}</span>}
      {field}
      {helperText && (
        <span className={`mt-1 block text-xs ${error ? "text-rose-500" : "text-gray-500"}`}>{helperText}</span>
      )}
    </label>
  );
}

// ── Custom select dropdown (replaces native <select>) ──────────────────────────
type SelectOption = { value: string | number; label: string };

function CustomSelect({
  value,
  onChange,
  children,
  className = "",
  disabled,
}: {
  value: string | number;
  onChange?: (event: { target: { value: string } }) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Build options from <MenuItem> children
  const options: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child)) {
      const p = child.props as any;
      options.push({ value: p.value ?? "", label: String(p.children ?? p.value ?? "") });
    }
  });

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const triggerClass =
    "w-full flex items-center justify-between rounded-full border border-gray-300 bg-white px-4 py-2 text-sm transition-colors cursor-pointer select-none dark:border-[#4a433d] dark:bg-[#181818] dark:text-[#f4efe8] " +
    (open
      ? "border-brand-primary ring-1 ring-brand-primary dark:border-[#ff9a64] dark:ring-[#ff9a64]"
      : "hover:border-gray-400 dark:hover:border-[#5b5149]") +
    (disabled ? " opacity-50 pointer-events-none" : "") +
    " " + className;

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        className={triggerClass}
        onClick={() => !disabled && setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={selected ? "text-gray-800 dark:text-[#f4efe8]" : "text-gray-400 dark:text-[#8d8378]"}>
          {selected?.label ?? "Select…"}
        </span>
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className={`size-3.5 shrink-0 text-gray-400 dark:text-[#a99f94] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-gray-200 bg-white py-1.5 shadow-lg dark:border-[#3b3732] dark:bg-[#202020] dark:shadow-black/40"
        >
          {options.map((opt) => {
            const isSelected = String(opt.value) === String(value);
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange?.({ target: { value: String(opt.value) } });
                  setOpen(false);
                }}
                className={`cursor-pointer px-4 py-2 text-sm transition-colors duration-100 ${
                  isSelected
                    ? "bg-brand-primary/10 font-semibold text-brand-primary dark:bg-[#3a2a22] dark:text-[#ffb487]"
                    : "text-gray-700 hover:bg-gray-100 dark:text-[#e8dfd5] dark:hover:bg-[#2a2724]"
                }`}
              >
                {opt.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function MenuItem(props: Props) {
  void props;
  return null;
}
export function Select({ sx, className = "", ...props }: ChangeProps) {
  return (
    <select
      className={`rounded-full border border-gray-300 bg-white px-4 py-2 text-sm dark:border-[#4a433d] dark:bg-[#181818] dark:text-[#f4efe8] ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}
export function InputAdornment({ className = "", ...props }: Props) {
  return <span className={className} {...props} />;
}

export function Checkbox({ onChange, checked, className, ...props }: ToggleProps) {
  return (
    <div className="flex h-5 items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange?.(event, event.target.checked)}
        style={
          checked
            ? {
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2 6l3 3 5-5' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
                backgroundSize: "100% 100%",
              }
            : undefined
        }
        className={`size-4 cursor-pointer appearance-none rounded border border-gray-300 bg-white transition-colors checked:border-brand-primary checked:bg-brand-primary disabled:cursor-default disabled:opacity-50 dark:border-[#5b5149] dark:bg-[#181818] dark:checked:border-[#ff9a64] dark:checked:bg-[#d48658] focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-1 dark:focus:ring-[#ff9a64] dark:focus:ring-offset-[#151515] ${className}`}
        {...props}
      />
    </div>
  );
}
export function Switch({ onChange, checked, className, ...props }: ToggleProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.preventDefault();
        onChange?.({} as any, !checked);
      }}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-offset-2 ${
        checked
          ? "bg-brand-primary"
          : "bg-gray-200 dark:bg-[#4a433d]"
      } ${className}`}
      {...props}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
export function FormControlLabel({
  control,
  label,
  className = "",
  ...props
}: Props) {
  return (
    <label
      className={`flex items-center gap-2 text-sm ${className}`}
      {...props}
    >
      {control}
      {label}
    </label>
  );
}

export function Tabs({
  value,
  onChange,
  children,
  className = "",
  ...props
}: {
  value: any;
  onChange: (event: any, value: any) => void;
  children: ReactNode;
  className?: string;
  [key: string]: any;
}) {
  return (
    <div className={`flex space-x-1 border-b border-gray-200 dark:border-[#3b3732] ${className}`} {...props}>
      {Children.map(children, (child: any, index: number) => {
        const childValue = child.props.value !== undefined ? child.props.value : index;
        return cloneElement(child, {
          selected: childValue === value,
          onClick: (e: any) => onChange(e, childValue),
        });
      })}
    </div>
  );
}

export function Tab({
  label,
  selected,
  onClick,
}: {
  label: ReactNode;
  value?: any;
  selected?: boolean;
  onClick?: (e: any) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium transition-colors duration-200 focus:outline-none ${
        selected
          ? "border-b-2 border-brand-primary text-brand-primary dark:border-[#ff9a64] dark:text-[#ffb487]"
          : "border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-[#a99f94] dark:hover:text-[#f4efe8] dark:hover:border-[#5b5149]"
      }`}
    >
      {label}
    </button>
  );
}

export function Dialog({
  open,
  onClose,
  maxWidth = "sm",
  fullWidth,
  children,
}: Props) {
  if (!open) return null;
  const widths: Record<string, string> = {
    xs: "max-w-sm",
    sm: "max-w-lg",
    md: "max-w-2xl",
    lg: "max-w-4xl",
    xl: "max-w-6xl",
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative w-full transform overflow-hidden rounded-xl bg-white shadow-xl transition-all dark:border dark:border-[#3b3732] dark:bg-[#202020] dark:text-[#f4efe8] dark:shadow-black/50 ${widths[maxWidth] ?? "max-w-lg"} ${fullWidth ? "w-full" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
export function DialogTitle({ className = "", ...props }: Props) {
  return (
    <h2
      className={`border-b border-gray-200 px-5 py-4 text-lg font-bold dark:border-[#3b3732] ${className}`}
      {...props}
    />
  );
}
export function DialogContent({ className = "", sx, ...props }: Props) {
  return (
    <div
      className={`space-y-4 px-5 py-4 ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}
export function DialogActions({ className = "", ...props }: Props) {
  return (
    <div
      className={`flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-[#3b3732] ${className}`}
      {...props}
    />
  );
}

export function Chip({
  label,
  color,
  variant,
  sx,
  className = "",
  ...props
}: Props) {
  const colors: Record<string, string> = {
    success:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-100 dark:border-emerald-500/30",
    error: "bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-100 dark:border-red-500/30",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-100 dark:border-amber-500/30",
    primary:
      "bg-brand-primary/10 text-brand-primary dark:bg-[#3a2a22] dark:text-[#ffb487] dark:border-[#684431]",
    default: "bg-gray-100 text-gray-700 dark:bg-[#2a2724] dark:text-[#e8dfd5] dark:border-[#4a433d]",
  };
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border border-transparent px-2 text-xs font-semibold ${colors[color ?? "default"]} ${variant === "outlined" ? "border-current bg-transparent" : ""} ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    >
      {label ?? props.children}
    </span>
  );
}
export function CircularProgress({
  size = 40,
  className = "",
  ...props
}: Props) {
  return (
    <span
      role="progressbar"
      className={`inline-block animate-spin rounded-full border-2 border-gray-300 border-t-brand-primary dark:border-[#4a433d] dark:border-t-[#ff9a64] ${className}`}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}
export function LinearProgress({ className = "", value, ...props }: Props) {
  const isDeterminate = typeof value === "number";
  return (
    <div
      role="progressbar"
      aria-valuenow={isDeterminate ? value : undefined}
      className={`h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-[#34302c] ${className}`}
      {...props}
    >
      {isDeterminate ? (
        <div
          className="h-full rounded-full bg-brand-primary dark:bg-[#ff9a64] transition-all duration-500 ease-out"
          style={{ width: `${value}%` }}
        />
      ) : (
        <div className="h-full w-1/3 animate-pulse rounded-full bg-brand-primary dark:bg-[#ff9a64]" />
      )}
    </div>
  );
}

export function Pagination({
  count = 1,
  page = 1,
  onChange,
  className = "",
  ...props
}: SelectionProps) {
  const pages = Array.from({ length: count }, (_, i) => i + 1);
  return (
    <nav
      className={`flex flex-wrap justify-center items-center gap-1 ${className}`}
      {...props}
    >
      {pages.map((item) => (
        <button
          type="button"
          key={item}
          aria-current={item === page ? "page" : undefined}
          onClick={(event) => onChange?.(event, item)}
          className={`flex items-center justify-center size-8 rounded-full text-sm transition-colors duration-200 ${item === page ? "bg-brand-primary/10 text-brand-primary font-bold dark:bg-[#3a2a22] dark:text-[#ffb487]" : "text-gray-600 hover:bg-gray-100 dark:text-[#d8d0c7] dark:hover:bg-[#2a2724]"}`}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}

const StepperContext = createContext(0);
export function Stepper({ activeStep = 0, className = "", ...props }: Props) {
  const childArray = Children.toArray(props.children).filter(isValidElement);
  const total = childArray.length;
  return (
    <StepperContext.Provider value={activeStep}>
      <div className={`flex items-center ${className}`} role="list">
        {childArray.map((child, index) => (
          <>
            {cloneElement(child as ReactElement<Props>, { stepIndex: index, key: index })}
            {index < total - 1 && (
              <div className="relative mx-2 flex-1 h-[2px] bg-gray-200 dark:bg-[#34302c] overflow-hidden rounded-full">
                <div
                  className="absolute inset-y-0 left-0 bg-brand-primary dark:bg-[#ff9a64] transition-all duration-500 ease-out rounded-full"
                  style={{ width: index < activeStep ? "100%" : "0%" }}
                />
              </div>
            )}
          </>
        ))}
      </div>
    </StepperContext.Provider>
  );
}
export function Step({ stepIndex = 0, className = "", ...props }: Props) {
  const active = useContext(StepperContext);
  const isCompleted = stepIndex < active;
  const isCurrent = stepIndex === active;
  return (
    <div
      role="listitem"
      className={`flex shrink-0 items-center gap-2.5 ${
        isCurrent
          ? "text-brand-primary dark:text-[#ffb487]"
          : isCompleted
          ? "text-brand-primary/70 dark:text-[#d48658]"
          : "text-gray-400 dark:text-[#8d8378]"
      } ${className}`}
      {...props}
    >
      <span
        className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
          isCompleted
            ? "bg-brand-primary text-white dark:bg-[#d48658] dark:text-[#151515]"
            : isCurrent
            ? "border-2 border-brand-primary text-brand-primary dark:border-[#ff9a64] dark:text-[#ffb487]"
            : "border-2 border-gray-300 text-gray-400 dark:border-[#5b5149] dark:text-[#8d8378]"
        }`}
      >
        {isCompleted ? (
          <svg viewBox="0 0 12 10" fill="none" className="size-3.5">
            <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          stepIndex + 1
        )}
      </span>
      {props.children}
    </div>
  );
}
export function StepLabel({ className = "", ...props }: Props) {
  return <span className={`text-xs font-semibold ${className}`} {...props} />;
}
