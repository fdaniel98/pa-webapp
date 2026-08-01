import {useId, useState} from "react";

import {INPUT_WITH_ICON} from "~/lib/theme";

type PasswordInputProps = {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    autoComplete?: string;
    required?: boolean;
    minLength?: number;
};

/** Campo de contraseña con botón de ojo para mostrar u ocultar el texto. */
export function PasswordInput({
                                  id,
                                  value,
                                  onChange,
                                  placeholder,
                                  autoComplete,
                                  required,
                                  minLength,
                              }: PasswordInputProps) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);

    return (
        <div className="relative">
            <input
                id={inputId}
                type={visible ? "text" : "password"}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                autoComplete={autoComplete}
                required={required}
                minLength={minLength}
                className={`${INPUT_WITH_ICON} w-full`}
            />
            <button
                type="button"
                onClick={() => setVisible((prev) => !prev)}
                aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={visible}
                aria-controls={inputId}
                title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-gray-500 transition-colors hover:text-brand focus:outline-none focus-visible:text-brand focus-visible:ring-2 focus-visible:ring-brand/50"
            >
                {visible ? <EyeOffIcon/> : <EyeIcon/>}
            </button>
        </div>
    );
}

const ICON_PROPS = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-[18px] w-[18px]",
    "aria-hidden": true,
};

function EyeIcon() {
    return (
        <svg {...ICON_PROPS}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg {...ICON_PROPS}>
            <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.6 18.6 0 0 1-2.4 3.4"/>
            <path d="M6.6 6.6A18.6 18.6 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.4-1.4"/>
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>
            <line x1="3" y1="3" x2="21" y2="21"/>
        </svg>
    );
}
