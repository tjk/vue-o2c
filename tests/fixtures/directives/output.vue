<script setup lang="ts">
import FocusTrap from 'primevue/focustrap';

// https://github.com/tjk/vue-o2c/issues/8

const vFocustrap = FocusTrap;
const vOther = {
  created(el, binding, vnode, prevVnode) {},
  beforeUpdate(el, binding, vnode, prevVnode) {},
};
</script>