# vo2c - Vue Options API to Composition API

**WORK IN PROGRESS** -- the following is not done:

- bunch of stuff not implemented (including watchers)
- $el needs to try to rewrite part of template
- would like to maintain indentation, quoting, and semicolon rules

Working through stuff case by case

## Example

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