<template>
  <div v-focustrap :class="containerClass" aria-live="polite">
      <div v-if="!d_active" ref="display" :class="displayClass" :tabindex="$attrs.tabindex || '0'" role="button" @click="open" @keydown.enter="open" v-bind="displayProps">
          <slot name="display"></slot>
      </div>
      <div v-else class="p-inplace-content">
          <slot name="content"></slot>
          <IPButton v-if="closable" :icon="closeIcon" :aria-label="closeAriaLabel" @click="close" v-bind="closeButtonProps" />
      </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import Button from 'primevue/button';
import FocusTrap from 'primevue/focustrap';

const props = withDefaults(defineProps<{
  closable?: boolean
  active?: boolean
  disabled?: boolean
  closeIcon?: string
  displayProps?: boolean
  closeButtonProps?: boolean
}>(), {
  closable: false,
  active: false,
  disabled: false,
  closeIcon: 'pi pi-times',
  displayProps: null,
  closeButtonProps: null,
});

const $primevue = inject('primevue') /* FIXME vue-o2c */;

const $emit = defineEmits(['open', 'close', 'update:active']);

const d_active = ref(props.active);
const undefined = ref();

const containerClass = computed(() => {
    return ['p-inplace p-component', { 'p-inplace-closable': props.closable }];
});
const displayClass = computed(() => {
    return ['p-inplace-display', { 'p-disabled': props.disabled }];
});
const closeAriaLabel = computed(() => {
    return $primevue.config.locale.aria ? $primevue.config.locale.aria.close : undefined;
});

watch(() => props.active, (newValue) => {
    d_active.value = newValue;
});

function open(event) {
          if (props.disabled) {
              return;
          }

          $emit('open', event);
          d_active.value = true;
          $emit('update:active', true);
      };
function close(event) {
    $emit('close', event);
    d_active.value = false;
    $emit('update:active', false);
    setTimeout(() => {
        undefined.value.focus();
    }, 0);
};

const vFocustrap = FocusTrap;
</script>

<style>
.p-inplace .p-inplace-display {
  display: inline;
  cursor: pointer;
}

.p-inplace .p-inplace-content {
  display: inline;
}

.p-fluid .p-inplace.p-inplace-closable .p-inplace-content {
  display: flex;
}

.p-fluid .p-inplace.p-inplace-closable .p-inplace-content > .p-inputtext {
  flex: 1 1 auto;
  width: 1%;
}
</style>