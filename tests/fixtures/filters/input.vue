<template>
  <div>{{hello | uppercase | concat(other)}}</div>
</template>

<script>
export default {
  data() {
    return {
      hello: "hello",
      other: 1,
    }
  },
  filters: {
    concat: (a0, a1) => {
      return a0 + a1
    },
    uppercase(v) {
      return v.toUpperCase()
    },
  },
}
</script>