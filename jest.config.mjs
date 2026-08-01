/**
 * Jest para la lógica pura de app/lib y los componentes de app/components.
 *
 * ts-jest compila los tests a CommonJS aunque el paquete sea ESM: Jest los evalúa
 * en su propio registro de módulos, así que no hace falta --experimental-vm-modules.
 *
 * Ojo: Jest no entiende `import.meta.env`, que es de Vite y se usa en
 * app/lib/supabase.ts. Los tests de componentes simulan los módulos de acceso a
 * datos (`~/lib/users`, `~/lib/matches`...), así que el cliente de Supabase nunca
 * llega a cargarse. Ver README.
 */
export default {
    testEnvironment: "jsdom",
    roots: ["<rootDir>/app"],
    testMatch: ["**/*.test.ts", "**/*.test.tsx"],
    setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
    transform: {
        "^.+\\.tsx?$": [
            "ts-jest",
            {
                tsconfig: {
                    module: "commonjs",
                    moduleResolution: "node",
                    target: "ES2022",
                    lib: ["ES2022", "DOM"],
                    jsx: "react-jsx",
                    esModuleInterop: true,
                    verbatimModuleSyntax: false,
                    strict: true,
                    // Este tsconfig sustituye al de la raíz, así que hay que
                    // declarar aquí los globales de Jest (describe/it/expect).
                    types: ["jest", "node"],
                },
            },
        ],
    },
    moduleNameMapper: {
        // motion se publica como ESM; se sustituye por elementos HTML planos.
        "^motion/react$": "<rootDir>/test/motion-stub.tsx",
        "^~/(.*)$": "<rootDir>/app/$1",
    },
    clearMocks: true,
};
