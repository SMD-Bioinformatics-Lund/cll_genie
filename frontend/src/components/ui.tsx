import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
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
  maxWidth = "lg",
  sx,
  className = "",
  ...props
}: Props) {
  const widths: Record<string, string> = {
    sm: "max-w-2xl",
    md: "max-w-3xl",
    lg: "max-w-5xl",
    xl: "max-w-screen-xl",
  };
  return (
    <div
      className={`mx-auto w-full px-4 sm:px-6 ${widths[maxWidth] ?? "max-w-screen-xl"} ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}

export function Paper({ sx, className = "", ...props }: Props) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-800 ${className}`}
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
    h1: "text-3xl font-bold",
    h2: "text-2xl font-bold",
    h3: "text-xl font-bold",
    h4: "text-lg font-bold",
    h5: "text-base font-bold",
    h6: "text-sm font-bold",
    subtitle1: "text-sm",
    subtitle2: "text-sm font-semibold",
    body1: "text-sm leading-6",
    body2: "text-xs leading-5",
    overline: "text-[0.68rem] font-bold uppercase tracking-widest",
  };
  const colors: Record<string, string> = {
    primary: "text-[#7B4925] dark:text-[#DF7849]",
    "text.secondary": "text-gray-500 dark:text-gray-400",
    "success.main": "text-emerald-700 dark:text-emerald-400",
    error: "text-red-700 dark:text-red-300",
  };
  return (
    <Component
      className={`${variants[variant] ?? "text-sm"} ${colors[color] ?? ""} ${className}`}
      style={{ ...sxStyle(sx), fontWeight, ...props.style }}
      {...props}
    />
  );
}

export function Button({
  component: Component = "button",
  variant = "contained",
  color = "primary",
  startIcon,
  endIcon,
  fullWidth,
  size,
  sx,
  className = "",
  ...props
}: Props) {
  const palette =
    color === "error"
      ? "bg-red-700 hover:bg-red-800 border-red-700 text-white"
      : color === "warning"
        ? "bg-amber-600 hover:bg-amber-700 border-amber-600 text-white"
        : "bg-[#7B4925] hover:bg-[#653b1e] border-[#7B4925] text-white dark:bg-[#DF7849] dark:hover:bg-[#c9653a] dark:border-[#DF7849] dark:text-neutral-950";
  const look =
    variant === "contained"
      ? palette
      : variant === "outlined"
        ? "border-[#7B4925] text-[#7B4925] hover:bg-[#7B4925]/10 dark:border-[#DF7849] dark:text-[#DF7849]"
        : "border-transparent text-[#7B4925] hover:bg-[#7B4925]/10 dark:text-[#DF7849]";
  const type = Component === "button" && !props.type ? "button" : props.type;
  return (
    <Component
      type={type}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${size === "large" ? "min-h-11 text-base" : "text-sm"} ${look} ${fullWidth ? "w-full" : ""} ${className}`}
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
  className = "",
  ...props
}: Props) {
  return (
    <button
      type="button"
      className={`inline-flex size-9 items-center justify-center rounded-full text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-neutral-700 ${color === "error" ? "text-red-700 dark:text-red-400" : ""} ${size === "small" ? "size-8" : ""} ${className}`}
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
      "border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    warning:
      "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    success:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
    info: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200",
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
  ...props
}: ChangeProps) {
  const control =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-[#7B4925] focus:ring-2 focus:ring-[#7B4925]/20 disabled:bg-gray-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-gray-100 dark:focus:border-[#DF7849]";
  const shared = {
    ...props,
    ...inputProps,
    className: `${control} ${className}`,
    style: mergeStyle({ ...props, sx }),
    readOnly: InputProps?.readOnly,
  };
  let field: ReactNode;
  if (select) field = <select {...shared}>{props.children}</select>;
  else if (multiline) field = <textarea rows={rows} {...shared} />;
  else
    field = (
      <div className="relative">
        <input {...shared} />
        {InputProps?.endAdornment && (
          <span className="absolute inset-y-0 right-1 flex items-center">
            {InputProps.endAdornment}
          </span>
        )}
      </div>
    );
  return (
    <label className="block w-full text-sm font-medium text-gray-700 dark:text-gray-200">
      {label && <span className="mb-1 block">{label}</span>}
      {field}
      {helperText && (
        <span className="mt-1 block text-xs text-gray-500">{helperText}</span>
      )}
    </label>
  );
}

export function MenuItem(props: Props) {
  return <option {...props} />;
}
export function Select({ sx, className = "", ...props }: ChangeProps) {
  return (
    <select
      className={`rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900 ${className}`}
      style={mergeStyle({ ...props, sx })}
      {...props}
    />
  );
}
export function InputAdornment({ className = "", ...props }: Props) {
  return <span className={className} {...props} />;
}

export function Checkbox({ onChange, checked, ...props }: ToggleProps) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange?.(event, event.target.checked)}
      className="size-4 accent-[#7B4925]"
      {...props}
    />
  );
}
export function Switch({ onChange, checked, ...props }: ToggleProps) {
  return (
    <input
      type="checkbox"
      role="switch"
      checked={checked}
      onChange={(event) => onChange?.(event, event.target.checked)}
      className="size-4 accent-[#7B4925]"
      {...props}
    />
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

const TabsContext = createContext<{
  value: any;
  onChange?: (event: SyntheticEvent, value: any) => void;
}>({ value: undefined });
export function Tabs({
  value,
  onChange,
  sx,
  className = "",
  ...props
}: SelectionProps) {
  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div
        role="tablist"
        className={`flex border-b border-gray-200 dark:border-neutral-700 ${className}`}
        style={mergeStyle({ ...props, sx })}
        {...props}
      />
    </TabsContext.Provider>
  );
}
export function Tab({ value, label, className = "", ...props }: Props) {
  const tabs = useContext(TabsContext);
  const active = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={(event) => tabs.onChange?.(event, value)}
      className={`border-b-2 px-4 py-2 text-sm font-semibold transition ${active ? "border-[#7B4925] text-[#7B4925] dark:border-[#DF7849] dark:text-[#DF7849]" : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"} ${className}`}
      {...props}
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
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`max-h-[90vh] overflow-auto rounded-xl bg-white shadow-2xl dark:bg-neutral-800 ${widths[maxWidth]} ${fullWidth ? "w-full" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
export function DialogTitle({ className = "", ...props }: Props) {
  return (
    <h2
      className={`border-b border-gray-200 px-5 py-4 text-lg font-bold dark:border-neutral-700 ${className}`}
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
      className={`flex justify-end gap-2 border-t border-gray-200 px-5 py-4 dark:border-neutral-700 ${className}`}
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
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    error: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    warning:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    primary:
      "bg-[#7B4925]/10 text-[#7B4925] dark:bg-[#DF7849]/15 dark:text-[#DF7849]",
    default: "bg-gray-100 text-gray-700 dark:bg-neutral-700 dark:text-gray-200",
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
      className={`inline-block animate-spin rounded-full border-2 border-gray-300 border-t-[#7B4925] dark:border-neutral-600 dark:border-t-[#DF7849] ${className}`}
      style={{ width: size, height: size }}
      {...props}
    />
  );
}
export function LinearProgress({ className = "", ...props }: Props) {
  return (
    <div
      role="progressbar"
      className={`h-1 w-full overflow-hidden bg-gray-200 dark:bg-neutral-700 ${className}`}
      {...props}
    >
      <div className="h-full w-1/3 animate-pulse bg-[#7B4925] dark:bg-[#DF7849]" />
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
      className={`flex flex-wrap justify-center gap-1 ${className}`}
      {...props}
    >
      {pages.map((item) => (
        <button
          type="button"
          key={item}
          aria-current={item === page ? "page" : undefined}
          onClick={(event) => onChange?.(event, item)}
          className={`size-8 rounded text-sm ${item === page ? "bg-[#7B4925] text-white dark:bg-[#DF7849] dark:text-neutral-950" : "hover:bg-gray-100 dark:hover:bg-neutral-700"}`}
        >
          {item}
        </button>
      ))}
    </nav>
  );
}

const StepperContext = createContext(0);
export function Stepper({ activeStep = 0, className = "", ...props }: Props) {
  return (
    <StepperContext.Provider value={activeStep}>
      <div className={`flex items-start gap-2 ${className}`} {...props}>
        {Children.map(props.children, (child, index) =>
          isValidElement(child)
            ? cloneElement(child as ReactElement<Props>, { stepIndex: index })
            : child,
        )}
      </div>
    </StepperContext.Provider>
  );
}
export function Step({ stepIndex = 0, className = "", ...props }: Props) {
  const active = useContext(StepperContext);
  return (
    <div
      className={`flex flex-1 items-center gap-2 ${stepIndex <= active ? "text-[#7B4925] dark:text-[#DF7849]" : "text-gray-400"} ${className}`}
      {...props}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-current text-xs font-bold">
        {stepIndex + 1}
      </span>
      {props.children}
    </div>
  );
}
export function StepLabel({ className = "", ...props }: Props) {
  return <span className={`text-xs font-semibold ${className}`} {...props} />;
}
