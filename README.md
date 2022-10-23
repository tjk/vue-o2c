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
export default {
  props: {
    greeting: {
      type: String,
      default: "Hello",
    },
  },
  data() {
    return {
      name: this.$route.query.name || 'John',
    };
  },
  methods: {
    doIt() {
      console.log(`${this.greeting} ${this.name}`);
    },
  },
  mounted() {
    this.doIt();
  },
};
</script>
```

```bash
$ git clone git@github.com:tjk/vo2c.git
$ cd vo2c
$ pnpm i
$ pnpm exec tsx index.ts ./example.vue
```

Will output the following:

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue"
import { useRoute } from "vue-router"

const props = withDefaults(defineProps<{
  greeting: string
}>(), {
  greeting: "Hello",
})

const $route = useRoute()

const name = ref($route.query.name || 'John')

onMounted(() => {
  doIt();
})

function doIt() {
  console.log(`${props.greeting} ${name.value}`);
}
</script>
```