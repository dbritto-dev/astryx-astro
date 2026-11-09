/**
 * Hidden story whose only job is to make `storybook build` bundle every component <script>
 * (see ScriptRegistry.generated.astro). Only `storybook build` loads it (main.ts); it is not in
 * the sidebar or the docs.
 */
import ScriptRegistry from './ScriptRegistry.generated.astro';

export default {
  title: 'Internal/Script registry',
  component: ScriptRegistry,
  tags: ['!dev', '!autodocs', '!test'],
};

export const Registry = {};
