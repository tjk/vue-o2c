# Vue Options API to Composition API

## Examples

### blog-1 (https://markus.oberlehner.net/blog/vue-3-composition-api-vs-options-api/)

```vue
<script>
// Options API
export default {
  data() {
    return {
      name: 'John',
    };
  },
  methods: {
    doIt() {
      console.log(`Hello ${this.name}`);
    },
  },
  mounted() {
    this.doIt();
  },
};
</script>
```

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue"

const name = ref('John')

onMounted(() => {
  doIt();
})

function doIt() {
  console.log(`Hello ${name.value}`);
}
</script>
```