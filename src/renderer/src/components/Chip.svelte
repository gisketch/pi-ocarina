<script lang="ts">
  /** One inline chip, everywhere.
   *
   *  Icon, gap, label, padding — a skill in the composer, a file in a sent
   *  message, a fold, all the same element, so a chip reads as the same thing
   *  wherever it appears. The classes live in `global.css` as `.inline-chip`
   *  because the composer's editor builds the same chip without a component
   *  (its chips are plain DOM inside a contenteditable), and two copies of
   *  the look would drift.
   *
   *  A button when it can be activated, a span when it is only a mark —
   *  drawn identically, which is honest: the difference is behavior. */
  import Icon from './Icon.svelte'
  import type { IconName } from '$lib/icons'

  export type ChipTone = 'accent' | 'warn' | 'dim'

  const {
    icon,
    label,
    tone = 'accent',
    onclick,
  }: {
    icon: IconName
    label: string
    tone?: ChipTone
    onclick?: () => void
  } = $props()
</script>

{#if onclick}<button type="button" class="inline-chip {tone}" {onclick}
    ><Icon name={icon} />{label}</button
  >{:else}<span class="inline-chip {tone}"><Icon name={icon} />{label}</span>{/if}
