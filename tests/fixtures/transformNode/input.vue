<script>
// test this.a, this['b'], this["c"], "this.d"
// what happens with more complex structures (eg. this['g'+'h'])
export default {
  data() {
    return {
      a: 0,
      b: 1,
      c: 2,
      d: 3,
    }
  },
  methods: {
    test() {
      return `${this.a} ${this['b']} ${this["c"]} this.d this.e`
    },
  },
}
</script>