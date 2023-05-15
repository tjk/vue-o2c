<script>
// https://github.com/tjk/vue-o2c/issues/8
import FocusTrap from 'primevue/focustrap';
export default {
  directives: {
    focustrap: FocusTrap,
    other: {
      created(el, binding, vnode, prevVnode) {},
      beforeUpdate(el, binding, vnode, prevVnode) {},
    }
  },
}
</script>