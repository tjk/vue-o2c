<script>
import { defineComponent } from "vue"

export default defineComponent({
  data() {
    return {
      firstName: "jane",
      lastName: "smith",
    }
  },
  computed: {
    fullName: {
      get: () => {
        return `${this.firstName} ${this.lastName}`
      },
      set(v) {
        const parts = v.split(" ")
        this.firstName = parts[0]
        this.lastName = parts[1]
      },
    },
  },
})
</script>