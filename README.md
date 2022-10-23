# vo2c - Vue Options API to Composition API

Given the following file:

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

```bash
$ npx tsx vo2c examples/blog-1/options.vue
```

Will output the following:

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